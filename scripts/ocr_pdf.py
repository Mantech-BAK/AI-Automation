"""Prints the text of a PDF to stdout (UTF-8), pages separated by a form feed (\\f).

Usage: python ocr_pdf.py <file.pdf>

1. If the PDF has a text layer (pdftotext returns more than MIN_TEXT_CHARS characters), that text is printed. Pages of
   it that have no text of their own (a scanned page inside an otherwise digital PDF) are read with OCR when it is available.
2. Otherwise every page is converted to an image (pdf2image / poppler) and read with EasyOCR (English + Arabic).

Progress and errors go to stderr; the exit code is non-zero when no text could be produced.
"""
import gc
import os
import re

# One CPU thread for torch / numpy: fewer worker buffers, so less memory. Set before torch is imported.
os.environ.setdefault('OMP_NUM_THREADS', '1')
os.environ.setdefault('MKL_NUM_THREADS', '1')

import subprocess
import sys

MIN_TEXT_CHARS = 50
# A page with fewer visible characters than this has no text layer of its own.
PAGE_MIN_CHARS = 30
OCR_LANGUAGES = ['en', 'ar']
OCR_DPI = 150
# Pages of a PDF that are read at all (a PDF can hold many documents) and the most that are put through OCR.
FIRST_PAGE = 1
LAST_PAGE = 20
OCR_MAX_PAGES = 10


def log(message):
    print(message, file=sys.stderr, flush=True)


def text_layer_pages(path):
    """Text of the PDF's own text layer, one string per page ([] when pdftotext is unavailable or fails)."""
    try:
        result = subprocess.run(
            ['pdftotext', '-f', str(FIRST_PAGE), '-l', str(LAST_PAGE), '-layout', '-enc', 'UTF-8', path, '-'],
            capture_output=True, timeout=120, check=True,
        )
    except (OSError, subprocess.SubprocessError) as error:
        log(f'pdftotext unavailable or failed: {error}')
        return []
    pages = result.stdout.decode('utf-8', errors='replace').split('\f')
    # pdftotext ends the last page with a form feed too
    if pages and not pages[-1].strip():
        pages.pop()
    return pages


def visible_chars(text):
    return len(re.sub(r'\s', '', text))


def ocr_pages(path, numbers):
    """OCR of the given 1-based page numbers: {number: text}. Raises when OCR is not available."""
    # Imported here so a PDF that has a text layer never pays the EasyOCR / torch start-up cost.
    from pdf2image import convert_from_path
    import easyocr
    import numpy
    import torch

    torch.set_num_threads(1)

    # POPPLER_PATH is only needed where poppler's bin folder is not on PATH (e.g. a Windows dev machine).
    poppler_path = os.environ.get('POPPLER_PATH') or None
    numbers = list(numbers)[:OCR_MAX_PAGES]
    log(f'OCR: {len(numbers)} page(s) to read at {OCR_DPI} DPI')
    reader = easyocr.Reader(OCR_LANGUAGES, gpu=False, verbose=False)

    # One page at a time: only a single page image is ever in memory (Railway kills the process when it runs out).
    texts = {}
    for number in numbers:
        images = convert_from_path(path, dpi=OCR_DPI, first_page=number, last_page=number, thread_count=1, poppler_path=poppler_path)
        image = images[0]
        # paragraph=True merges nearby boxes into lines of text, which reads better for the AI than loose words.
        lines = reader.readtext(numpy.array(image.convert('RGB')), detail=0, paragraph=True)
        texts[number] = '\n'.join(lines)
        log(f'OCR: page {number} -> {len(texts[number].strip())} chars')
        del image, images, lines
        gc.collect()

    del reader
    gc.collect()
    return texts


def page_count(path):
    try:
        from pdf2image import pdfinfo_from_path
        return int(pdfinfo_from_path(path, poppler_path=os.environ.get('POPPLER_PATH') or None)['Pages'])
    except Exception:
        return None


def main():
    if len(sys.argv) != 2:
        log('usage: ocr_pdf.py <file.pdf>')
        return 2
    path = sys.argv[1]
    sys.stdout.reconfigure(encoding='utf-8')

    pages = text_layer_pages(path)
    if sum(len(p.strip()) for p in pages) > MIN_TEXT_CHARS:
        log('text layer found - no OCR needed for the PDF as a whole')
        weak = [index + 1 for index, text in enumerate(pages) if visible_chars(text) < PAGE_MIN_CHARS]
        if weak:
            log(f'page(s) {weak} have no text layer - running OCR on them')
            try:
                for number, text in ocr_pages(path, weak).items():
                    pages[number - 1] = text
            except Exception as error:  # OCR not installed, out of memory, ... - the pages stay empty and are reported as unreadable
                log(f'OCR could not be used for page(s) {weak}: {error}')
        sys.stdout.write('\f'.join(pages))
        return 0

    log('no usable text layer - running OCR')
    total = page_count(path) or 1
    numbers = range(FIRST_PAGE, min(LAST_PAGE, total) + 1)
    texts = ocr_pages(path, numbers)
    text = '\f'.join(texts[number] for number in sorted(texts))
    if not text.strip():
        log('OCR found no text')
        return 1
    sys.stdout.write(text)
    return 0


if __name__ == '__main__':
    sys.exit(main())
