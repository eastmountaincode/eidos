#!/usr/bin/env python3
"""Generate a PDF invoice for Eidos.

The script is intentionally CLI-first so the agent can call it from Telegram,
SSH, or future portal workflows. It prints a compact JSON result containing the
generated PDF path.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import textwrap
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
import urllib.request


@dataclass
class LineItem:
    description: str
    quantity: float
    rate: float

    @property
    def amount(self) -> float:
        return self.quantity * self.rate


def parse_args() -> argparse.Namespace:
    home = Path.home()
    eidos_home = home / ".eidos"
    load_env_file(eidos_home / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=str(eidos_home / "data/invoices/config.json"))
    parser.add_argument("--client", required=True, help="Client or organization name.")
    parser.add_argument("--bill-to-name", default=None, help="Visible bill-to name. Defaults to --client. Pass an empty string to leave it blank.")
    parser.add_argument("--client-address", action="append", default=[], help="Client address line. Repeat for multiple lines.")
    parser.add_argument("--invoice-number", default="", help="Manual invoice number. Defaults to D1-backed per-client numbering.")
    parser.add_argument("--invoice-digits", type=int, default=3, help="Minimum digits for automatic invoice numbers. Default: 3.")
    parser.add_argument("--set-next-number", type=int, default=0, help="Set the next D1-backed invoice number for this client, then exit.")
    parser.add_argument("--date", default="", help="Invoice date. Defaults to today.")
    parser.add_argument("--due", default="", help="Optional due terms/date, such as 'Net 14'.")
    parser.add_argument("--item", action="append", default=[], help="Line item as 'Description|hours|rate'. Repeatable.")
    parser.add_argument("--flat-item", action="append", default=[], help="Fixed line item as 'Description|amount'. Repeatable.")
    parser.add_argument("--payment-line", action="append", default=[], help="Payment instruction line. Overrides config if provided.")
    parser.add_argument("--note", action="append", default=[], help="Optional note line. Repeatable.")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults to config or ~/.eidos/data/outbox/invoices.")
    parser.add_argument("--output", default="", help="Explicit PDF output path.")
    parser.add_argument("--api-url", default=os.environ.get("EIDOS_WORKER_URL", ""), help="Eidos Worker URL. Defaults to EIDOS_WORKER_URL or config.")
    parser.add_argument("--api-token", default=os.environ.get("EIDOS_API_TOKEN", ""), help="Eidos API token. Defaults to EIDOS_API_TOKEN or config.")
    return parser.parse_args()


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_config(path: str) -> dict[str, Any]:
    config_path = Path(path).expanduser()
    if not config_path.exists():
        return {}
    return json.loads(config_path.read_text(encoding="utf-8"))


def parse_money(value: str) -> float:
    cleaned = value.replace("$", "").replace(",", "").strip()
    return float(cleaned)


def parse_item(value: str) -> LineItem:
    parts = [part.strip() for part in value.split("|")]
    if len(parts) != 3 or not parts[0]:
        raise ValueError(f"Invalid --item value: {value!r}. Use 'Description|hours|rate'.")
    return LineItem(parts[0], float(parts[1]), parse_money(parts[2]))


def parse_flat_item(value: str) -> LineItem:
    parts = [part.strip() for part in value.split("|")]
    if len(parts) != 2 or not parts[0]:
        raise ValueError(f"Invalid --flat-item value: {value!r}. Use 'Description|amount'.")
    return LineItem(parts[0], 1.0, parse_money(parts[1]))


def slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_") or "invoice"


def money(value: float) -> str:
    return f"${value:,.2f}"


def request_json(api_url: str, token: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{api_url.rstrip('/')}{path}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Eidos/0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def api_credentials(args: argparse.Namespace, config: dict[str, Any]) -> tuple[str, str]:
    api_url = args.api_url or str(config.get("api_url") or config.get("worker_url") or "")
    api_token = args.api_token or str(config.get("api_token") or "")
    return api_url, api_token


def require_api_credentials(args: argparse.Namespace, config: dict[str, Any]) -> tuple[str, str]:
    api_url, api_token = api_credentials(args, config)
    if not api_url or not api_token:
        raise SystemExit("EIDOS_WORKER_URL and EIDOS_API_TOKEN are required for automatic invoice numbering.")
    return api_url, api_token


def reserve_invoice_number(args: argparse.Namespace, config: dict[str, Any]) -> dict[str, Any]:
    api_url, api_token = require_api_credentials(args, config)
    return request_json(api_url, api_token, "/api/invoices/reserve-number", {
        "client": args.client,
        "invoice_digits": args.invoice_digits,
    })


def set_next_invoice_number(args: argparse.Namespace, config: dict[str, Any]) -> dict[str, Any]:
    api_url, api_token = require_api_credentials(args, config)
    return request_json(api_url, api_token, "/api/invoices/client-counter", {
        "client": args.client,
        "next_invoice_number": args.set_next_number,
        "invoice_digits": args.invoice_digits,
    })


def record_invoice(args: argparse.Namespace, config: dict[str, Any], invoice_number: str, total: float, output_path: Path) -> dict[str, Any] | None:
    api_url, api_token = api_credentials(args, config)
    if not api_url or not api_token:
        return None
    return request_json(api_url, api_token, "/api/invoices/records", {
        "client": args.client,
        "invoice_number": invoice_number,
        "total": round(total, 2),
        "pdf_path": str(output_path),
        "invoice_digits": args.invoice_digits,
    })


def draw_text_lines(canvas: Any, x: float, y: float, lines: list[str], leading: float = 13) -> float:
    for line in lines:
        if line:
            canvas.drawString(x, y, line)
            y -= leading
    return y


def wrap_description(canvas: Any, text: str, max_width: float, font_name: str = "Helvetica", font_size: float = 9) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if not current or canvas.stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines or [""]


def format_quantity(value: float) -> str:
    if value.is_integer():
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def create_invoice(args: argparse.Namespace) -> dict[str, Any]:
    try:
        from reportlab.lib.colors import HexColor
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ImportError as exc:
        raise SystemExit("ReportLab is required on the invoice host: python3 -m pip install reportlab") from exc

    config = load_config(args.config)
    items = [parse_item(item) for item in args.item] + [parse_flat_item(item) for item in args.flat_item]
    if not items:
        raise SystemExit("At least one --item or --flat-item is required.")

    reserved_number: dict[str, Any] | None = None
    if args.invoice_number:
        invoice_number = args.invoice_number
    else:
        reserved_number = reserve_invoice_number(args, config)
        invoice_number = str(reserved_number["invoice_number"])

    invoice_date = args.date or datetime.now().strftime("%B %-d, %Y")
    from_name = config.get("from_name") or "Andrew Boylan"
    from_address = [str(line) for line in config.get("from_address", []) if str(line).strip()]
    bill_to_name = args.client if args.bill_to_name is None else args.bill_to_name
    client_address = [line for line in args.client_address if line.strip()]
    payment_lines = args.payment_line or [str(line) for line in config.get("payment_lines", []) if str(line).strip()]
    output_dir = Path(args.output_dir or config.get("output_dir") or "~/.eidos/data/outbox/invoices").expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = Path(args.output).expanduser() if args.output else output_dir / f"Invoice_{slug(args.client)}_{slug(invoice_number)}.pdf"

    pdf = canvas.Canvas(str(output_path), pagesize=letter)
    width, height = letter

    black = HexColor("#111111")
    dark = HexColor("#333333")
    gray = HexColor("#777777")
    light_gray = HexColor("#CCCCCC")

    margin = 60
    right = width - margin
    y = height - 60

    pdf.setFont("Helvetica-Bold", 22)
    pdf.setFillColor(black)
    pdf.drawString(margin, y, "INVOICE")

    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(gray)
    pdf.drawRightString(right, y + 4, f"Invoice #{invoice_number}")
    pdf.drawRightString(right, y - 10, invoice_date)
    if args.due:
        pdf.drawRightString(right, y - 24, f"Due: {args.due}")

    y -= 28
    pdf.setStrokeColor(black)
    pdf.setLineWidth(0.75)
    pdf.line(margin, y, right, y)

    y -= 22
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(gray)
    pdf.drawString(margin, y, "FROM")
    pdf.drawString(300, y, "BILL TO")

    y -= 14
    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(dark)
    pdf.drawString(margin, y, from_name)
    pdf.drawString(300, y, bill_to_name)

    y -= 13
    pdf.setFont("Helvetica", 9)
    pdf.setFillColor(gray)
    from_y = draw_text_lines(pdf, margin, y, from_address)
    bill_y = draw_text_lines(pdf, 300, y, client_address)
    y = min(from_y, bill_y) - 14

    pdf.setStrokeColor(black)
    pdf.setLineWidth(0.75)
    pdf.line(margin, y, right, y)

    y -= 13
    pdf.setFont("Helvetica-Bold", 8)
    pdf.setFillColor(dark)
    pdf.drawString(margin, y, "DESCRIPTION")
    pdf.drawRightString(365, y, "QTY")
    pdf.drawRightString(440, y, "RATE")
    pdf.drawRightString(right, y, "AMOUNT")

    y -= 8
    pdf.setLineWidth(0.5)
    pdf.setStrokeColor(light_gray)
    pdf.line(margin, y, right, y)

    total = 0.0
    pdf.setFont("Helvetica", 9)
    for item in items:
        amount = item.amount
        total += amount
        description_lines = wrap_description(pdf, item.description, max_width=265)
        row_height = 18 + (len(description_lines) - 1) * 11
        y -= 18
        if y - row_height < 120:
            pdf.showPage()
            y = height - 60
            pdf.setFont("Helvetica", 9)
        pdf.setFillColor(dark)
        for index, line in enumerate(description_lines):
            pdf.drawString(margin, y - index * 11, line)
        pdf.drawRightString(365, y, format_quantity(item.quantity))
        pdf.drawRightString(440, y, money(item.rate))
        pdf.drawRightString(right, y, money(amount))
        y -= 8 + (len(description_lines) - 1) * 11
        pdf.setStrokeColor(light_gray)
        pdf.line(margin, y, right, y)

    y -= 22
    pdf.setStrokeColor(black)
    pdf.setLineWidth(0.75)
    pdf.line(380, y, right, y)

    y -= 16
    pdf.setFont("Helvetica-Bold", 10)
    pdf.setFillColor(black)
    pdf.drawString(380, y, "TOTAL")
    pdf.drawRightString(right, y, money(total))

    footer_y = 95
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(gray)
    if payment_lines:
        footer_y = draw_text_lines(pdf, margin, footer_y, payment_lines, leading=12)
    if args.note:
        draw_text_lines(pdf, 300, 95, [line for line in args.note if line.strip()], leading=12)

    pdf.save()
    record_result: dict[str, Any] | None = None
    record_error = ""
    try:
        record_result = record_invoice(args, config, invoice_number, total, output_path)
    except Exception as exc:
        record_error = str(exc)

    result = {
        "status": "created",
        "invoice_number": invoice_number,
        "client": args.client,
        "total": round(total, 2),
        "pdf_path": str(output_path),
    }
    if reserved_number:
        result["number_source"] = "d1"
        result["next_invoice_number"] = reserved_number.get("client", {}).get("next_invoice_number_formatted")
    else:
        result["number_source"] = "manual"
    if record_result:
        result["recorded"] = True
    elif record_error:
        result["recorded"] = False
        result["record_error"] = record_error
    return result


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    if args.set_next_number:
        result = set_next_invoice_number(args, config)
    else:
        result = create_invoice(args)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
