"""Read-only document extraction. Originals are never executed or modified.

Usage: python read_attachment.py ORIGINAL OUTPUT_DIRECTORY [PDF_PAGE_NUMBER]
PDF page numbers are one-based. Only bounded previews are made automatically;
the agent can request further pages using the optional argument.
"""
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
import zipfile

source = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2])
out.mkdir(mode=0o700, parents=True, exist_ok=True)
ext = source.suffix.lower()
limit = 200_000
text = ""
images = []
notes = []

if ext == ".pdf":
    import pymupdf
    doc = pymupdf.open(source)
    if doc.needs_pass:
        raise ValueError("This PDF is password-protected. Upload an unlocked copy.")
    notes.append(f"PDF has {len(doc)} pages. Automatic extraction covers at most 200 pages and {limit} characters; preview images cover the first 3 pages only. Read additional original pages as needed.")
    for i in range(min(len(doc), 200)):
        page_text = doc[i].get_text()
        text += f"\n--- Page {i + 1} ---\n{page_text}"
        if len(text) >= limit:
            break
    pages = [int(sys.argv[3]) - 1] if len(sys.argv) > 3 else range(min(len(doc), 3))
    for i in pages:
        page = doc[i]
        scale = min(2, 1600 / max(page.rect.width, page.rect.height))
        path = out / f"page-{i + 1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False).save(path)
        images.append(str(path))
elif ext in {".docx", ".xlsx", ".pptx"}:
    with zipfile.ZipFile(source) as archive:
        entries = archive.infolist()
        if len(entries) > 5000 or sum(entry.file_size for entry in entries) > 100 * 1024 * 1024:
            raise ValueError("This document expands beyond the reading limit.")
        def xml(name):
            data = archive.read(name)
            if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
                raise ValueError("XML entities are not supported.")
            return ET.fromstring(data)
        def local(tag):
            return tag.rsplit("}", 1)[-1]
        if ext == ".docx":
            root = xml("word/document.xml")
            text = "\n".join("".join(node.text or "" for node in paragraph.iter() if local(node.tag) == "t") for paragraph in root.iter() if local(paragraph.tag) == "p")
        elif ext == ".pptx":
            slides = sorted((name for name in archive.namelist() if name.startswith("ppt/slides/slide") and name.endswith(".xml")), key=lambda name: int(pathlib.Path(name).stem[5:]))
            for name in slides:
                text += f"\n--- {pathlib.Path(name).stem} ---\n" + "\n".join(node.text or "" for node in xml(name).iter() if local(node.tag) == "t")
                if len(text) >= limit:
                    break
        else:
            strings = []
            if "xl/sharedStrings.xml" in archive.namelist():
                strings = ["".join(n.text or "" for n in si.iter() if local(n.tag) == "t") for si in xml("xl/sharedStrings.xml")]
            for name in sorted(n for n in archive.namelist() if n.startswith("xl/worksheets/sheet") and n.endswith(".xml")):
                text += f"\n--- {name} ---\n"
                for cell in xml(name).iter():
                    if local(cell.tag) != "c":
                        continue
                    values = [n.text or "" for n in cell.iter() if local(n.tag) in {"v", "t"}]
                    value = " ".join(values)
                    if cell.attrib.get("t") == "s" and value.isdigit():
                        value = strings[int(value)]
                    formulas = [n.text or "" for n in cell if local(n.tag) == "f"]
                    text += f"{cell.attrib.get('r', '?')}: {value}" + (f" (formula: {' '.join(formulas)})" if formulas else "") + "\n"
                    if len(text) >= limit:
                        break
                if len(text) >= limit:
                    break
    notes.append("Office text/cells extracted without executing macros or formulas. Layout, embedded images and charts are not represented in this text; the original remains available.")
else:
    raise ValueError("Unsupported extraction format.")

if len(text) > limit:
    notes.append("Text preview is truncated. Read the original for omitted content.")
text_path = out / "extracted.txt"
text_path.write_text(text[:limit], encoding="utf-8")
print(json.dumps({"text_path": str(text_path), "images": images, "notes": notes}))
