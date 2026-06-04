# Invoice Service

Purpose: generate clean PDF invoices from structured inputs.

The agent-facing command is:

```sh
python3 ~/.eidos/services/invoices/create_invoice.py \
  --client "Client Name" \
  --item "Design work|2|75"
```

The script writes the PDF to `~/.eidos/data/outbox/invoices` by default and prints JSON containing `pdf_path`. When Eidos is running through Telegram, the gateway sends referenced local PDF paths back as Telegram documents.

Invoice numbers are D1-backed per client when `EIDOS_WORKER_URL` and `EIDOS_API_TOKEN` are available. If no `--invoice-number` is passed, the script reserves the next number for that client, formatted as `001`, `002`, etc., then records the generated PDF in D1.

Private defaults live outside Git:

```sh
~/.eidos/data/invoices/config.json
```

Use `services/invoices/config.example.json` as the shape. Keep addresses, payment handles, and client defaults out of the repo.

Line item formats:

- `--item "Description|hours|rate"` calculates `hours * rate`.
- `--flat-item "Description|amount"` creates a fixed-price line.

Useful options:

- `--client-address "Line 1" --client-address "Line 2"`
- `--invoice-number "024"` for a manual override
- `--set-next-number 4 --client "Desire Path Radio"` to seed or correct that client's next automatic number
- `--invoice-digits 3` to control zero-padding
- `--date "June 4, 2026"`
- `--due "Net 14"`
- `--payment-line "Venmo: ..."`
- `--output-dir "/path/to/folder"`
