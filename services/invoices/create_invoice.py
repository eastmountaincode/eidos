#!/usr/bin/env python3
"""Generate a PDF invoice for Eidos.

The script is intentionally CLI-first so the agent can call it from Telegram,
SSH, or future portal workflows. It prints a compact JSON result containing the
generated PDF path.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


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
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=str(eidos_home / "data/invoices/config.json"))
    parser.add_argument("--client", required=True, help="Client or organization name.")
    parser.add_argument("--client-address", action="append", default=[], help="Client address line. Repeat for multiple lines.")
    parser.add_argument("--invoice-number", default="", help="Invoice number. Defaults to timestamp-based ID.")
    parser.add_argument("--date", default="", help="Invoice date. Defaults to today.")
    parser.add_argument("--due", default="", help="Optional due terms/date, such as 'Net 14'.")
    parser.add_argument("--item", action="append", default=[], help="Line item as 'Description|hours|rate'. Repeatable.")
    parser.add_argument("--flat-item", action="append", default=[], help="Fixed line item as 'Description|amount'. Repeatable.")
    parser.add_argument("--payment-line", action="append", default=[], help="Payment instruction line. Overrides config if provided.")
    parser.add_argument("--note", action="append", default=[], help="Optional note line. Repeatable.")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults to config or ~/.eidos/data/outbox/invoices.")
    parser.add_argument("--output", default="", help="Explicit PDF output path.")
    return parser.parse_args()


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


def draw_text_lines(canvas: Any, x: float, y: float, lines: list[str], leading: float = 13) -> float:
    for line in lines:
        if line:
            canvas.drawString(x, y, line)
            y -= leading
    return y


def truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[: max_chars - 1] + "..."


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

    invoice_number = args.invoice_number or datetime.now().strftime("%Y%m%d-%H%M")
    invoice_date = args.date or datetime.now().strftime("%B %-d, %Y")
    from_name = config.get("from_name") or "Andrew Boylan"
    from_address = [str(line) for line in config.get("from_address", []) if str(line).strip()]
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
    pdf.drawString(300, y, args.client)

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
        y -= 18
        if y < 120:
            pdf.showPage()
            y = height - 60
            pdf.setFont("Helvetica", 9)
        pdf.setFillColor(dark)
        pdf.drawString(margin, y, truncate(item.description, 58))
        pdf.drawRightString(365, y, f"{item.quantity:g}")
        pdf.drawRightString(440, y, money(item.rate))
        pdf.drawRightString(right, y, money(amount))
        y -= 8
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
    return {
        "status": "created",
        "invoice_number": invoice_number,
        "client": args.client,
        "total": round(total, 2),
        "pdf_path": str(output_path),
    }


def main() -> None:
    result = create_invoice(parse_args())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
