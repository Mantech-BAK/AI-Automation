"""Prints the text of a PDF to stdout (UTF-8), pages separated by a form feed (\\f).

Usage: python ocr_pdf.py <file.pdf>

1. If the PDF has a text layer (pdftotext returns more than MIN_TEXT_CHARS characters), that text is printed.
2. Otherwise every page is converted to an image (pdf2image / poppler) and read with EasyOCR (English + Arabic).

Progress and errors go to stderr; the exit code is non-zero when no text could be produced.
"""
import os
import subprocess
import sys

MIN_TEXT_CHARS = 50
OCR_LANGUAGES = ['en', 'ar']
OCR_DPI = 200


def log(message):
    print(message, file=sys.stderr, flush=True)


def text_layer(path):
    """Text of the PDF's own text layer, pages separated by \\f ('' when pdftotext is unavailable or fails)."""
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', '-enc', 'UTF-8', path, '-'],
            capture_output=True, timeout=120, check=True,
        )
    except (OSError, subprocess.SubprocessError) as error:
        log(f'pdftotext unavailable or failed: {error}')
        return ''
    return result.stdout.decode('utf-8', errors='replace')


def ocr_pages(path):
    # Imported here so a PDF that has a text layer never pays the EasyOCR / torch start-up cost.
    from pdf2image import convert_from_path
    import easyocr
    import numpy

    # POPPLER_PATH is only needed where poppler's bin folder is not on PATH (e.g. a Windows dev machine).
    images = convert_from_path(path, dpi=OCR_DPI, poppler_path=os.environ.get('POPPLER_PATH') or None)
    log(f'OCR: {len(images)} page(s) converted to images')
    reader = easyocr.Reader(OCR_LANGUAGES, gpu=False, verbose=False)
    pages = []
    for number, image in enumerate(images, start=1):
        # paragraph=True merges nearby boxes into lines of text, which reads better for the AI than loose words.
        lines = reader.readtext(numpy.array(image.convert('RGB')), detail=0, paragraph=True)
        pages.append('\n'.join(lines))
        log(f'OCR: page {number} -> {len(pages[-1].strip())} chars')
    return pages


def main():
    if len(sys.argv) != 2:
        log('usage: ocr_pdf.py <file.pdf>')
        return 2
    path = sys.argv[1]
    sys.stdout.reconfigure(encoding='utf-8')

    text = text_layer(path)
    if len(text.strip()) > MIN_TEXT_CHARS:
        log('text layer found - no OCR needed')
        sys.stdout.write(text)
        return 0

    log('no usable text layer - running OCR')
    pages = ocr_pages(path)
    text = '\f'.join(pages)
    if not text.strip():
        log('OCR found no text')
        return 1
    sys.stdout.write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
