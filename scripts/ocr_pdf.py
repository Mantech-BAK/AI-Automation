"""Prints the text of a PDF to stdout (UTF-8), pages separated by a form feed (\\f).

Usage: python ocr_pdf.py <file.pdf>

1. If the PDF has a text layer (pdftotext returns more than MIN_TEXT_CHARS characters), that text is printed.
2. Otherwise every page is converted to an image (pdf2image / poppler) and read with EasyOCR (English + Arabic).

Progress and errors go to stderr; the exit code is non-zero when no text could be produced.
"""
import gc
import os
import subprocess
import sys

MIN_TEXT_CHARS = 50
OCR_LANGUAGES = ['en', 'ar']
OCR_DPI = 150
# Only the first pages of a PDF are ever read.
FIRST_PAGE = 1
LAST_PAGE = 2


def log(message):
    print(message, file=sys.stderr, flush=True)


def text_layer(path):
    """Text of the PDF's own text layer, pages separated by \\f ('' when pdftotext is unavailable or fails)."""
    try:
        result = subprocess.run(
            ['pdftotext', '-f', str(FIRST_PAGE), '-l', str(LAST_PAGE), '-layout', '-enc', 'UTF-8', path, '-'],
            capture_output=True, timeout=120, check=True,
        )
    except (OSError, subprocess.SubprocessError) as error:
        log(f'pdftotext unavailable or failed: {error}')
        return ''
    return result.stdout.decode('utf-8', errors='replace')


def ocr_pages(path):
    # Imported here so a PDF that has a text layer never pays the EasyOCR / torch start-up cost.
    from pdf2image import convert_from_path, pdfinfo_from_path
    import easyocr
    import numpy

    # POPPLER_PATH is only needed where poppler's bin folder is not on PATH (e.g. a Windows dev machine).
    poppler_path = os.environ.get('POPPLER_PATH') or None
    last_page = min(LAST_PAGE, int(pdfinfo_from_path(path, poppler_path=poppler_path)['Pages']))
    log(f'OCR: {last_page - FIRST_PAGE + 1} page(s) to read at {OCR_DPI} DPI')
    reader = easyocr.Reader(OCR_LANGUAGES, gpu=False, verbose=False)

    # One page at a time: only a single page image is ever in memory (Railway kills the process when it runs out).
    pages = []
    for number in range(FIRST_PAGE, last_page + 1):
        images = convert_from_path(path, dpi=OCR_DPI, first_page=number, last_page=number, thread_count=1, poppler_path=poppler_path)
        image = images[0]
        # paragraph=True merges nearby boxes into lines of text, which reads better for the AI than loose words.
        lines = reader.readtext(numpy.array(image.convert('RGB')), detail=0, paragraph=True)
        pages.append('\n'.join(lines))
        log(f'OCR: page {number} -> {len(pages[-1].strip())} chars')
        del image, images, lines
        gc.collect()

    del reader
    gc.collect()
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
