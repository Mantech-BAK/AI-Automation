"""Generates the sample PDFs used by tests/documents. Every company, number and date is invented.

Needs reportlab and pypdf (development only):  python tests/fixtures/make_pdfs.py
The generated PDFs are committed, so running the tests needs neither.
"""
import io
import os

from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pdfs')
os.makedirs(OUT, exist_ok=True)
W, H = A4


def new_pdf():
    buffer = io.BytesIO()
    return buffer, canvas.Canvas(buffer, pagesize=A4)


def write(name, buffer):
    path = os.path.join(OUT, name)
    if os.path.exists(path):  # committed fixtures are never regenerated (the PDF library stamps the time into them)
        return
    with open(path, 'wb') as handle:
        handle.write(buffer.getvalue())


def lines(c, rows, top=H - 70, size=11, gap=20):
    y = top
    for row in rows:
        if row.startswith('# '):
            c.setFont('Helvetica-Bold', 17)
            c.drawString(60, y, row[2:])
            y -= gap + 6
            c.setFont('Helvetica', size)
        else:
            c.setFont('Helvetica', size)
            c.drawString(60, y, row)
            y -= gap


def licence_page(c, company, licence, cr, issue=None, expiry=None, extra=(), marker=None):
    rows = [company, '# Commercial Trade Licence', f'Licence No: {licence}', f'CR No: {cr}', f'Company Name: {company}',
            'Activity: general maintenance, cleaning and supply of spare parts', 'Issuing Authority: Ministry of Industry and Commerce']
    if issue:
        rows.append(f'Issue Date: {issue}')
    if expiry:
        rows.append(f'Expiry Date: {expiry}')
    rows += list(extra)
    if marker:
        rows.append(marker)
    lines(c, rows)
    c.showPage()


def cr_page(c, company, cr, issue, expiry=None):
    rows = [company, '# Commercial Registration Certificate', f'CR No: {cr}', f'Company Name: {company}',
            'Legal form: With Limited Liability Company', f'Date of Issue: {issue}']
    if expiry:
        rows.append(f'Expiry Date: {expiry}')
    lines(c, rows)
    c.showPage()


def stamp_only_page(c):
    """A page with drawings but no text at all - what a scan with no text layer looks like to the text extractor."""
    c.rect(70, 300, 450, 300)
    c.circle(300, 450, 90)
    c.line(80, 320, 510, 580)
    c.showPage()


def build(name, drawer):
    buffer, c = new_pdf()
    drawer(c)
    c.save()
    write(name, buffer)


# 1. no expiry date, no issue date, no validity period -> saved with the expiry missing
build('no_expiry.pdf', lambda c: licence_page(c, 'Orion Facilities W.L.L', 'LIC-100100', '71001-1'))

# 2. issue date + a stated validity period -> expiry calculated (15/01/2026 + 4 years = 15/01/2030)
build('valid_4_years.pdf', lambda c: licence_page(c, 'Nimbus Catering W.L.L', 'LIC-200200', '72002-1', issue='15/01/2026',
                                                  extra=['This licence is valid for four (4) years from the date of issue.']))

# 3. issue date but no period -> expiry missing
build('issue_no_period.pdf', lambda c: licence_page(c, 'Pioneer Logistics W.L.L', 'LIC-300300', '73003-1', issue='20/02/2026'))

# 3b. two different periods in the text -> ambiguous, expiry missing
build('ambiguous_period.pdf', lambda c: licence_page(c, 'Quartz Engineering W.L.L', 'LIC-310310', '73103-1', issue='01/03/2026',
                                                     extra=['Valid for one year for trading activities.', 'Valid for three years for the premises.']))

# 3c. validity stated as "valid for one year"
build('valid_one_year.pdf', lambda c: licence_page(c, 'Radiant Cleaning W.L.L', 'LIC-320320', '73203-1', issue='10/04/2026',
                                                   extra=['Validity: valid for one year from the date of issue.']))

# 3d. stated expiry date (the ordinary case)
build('stated_expiry.pdf', lambda c: licence_page(c, 'Summit Contracting W.L.L', 'LIC-330330', '73303-1', issue='01/06/2026', expiry='31/05/2030'))


# 4. two different single-page documents (licence + CR certificate of the same company)
def two_docs(c):
    licence_page(c, 'Titan Trading W.L.L', 'LIC-400400', '74004-1', issue='05/05/2026', expiry='04/05/2030')
    cr_page(c, 'Titan Trading W.L.L', '74004-1', '01/03/2024', expiry='28/02/2030')


build('two_docs.pdf', two_docs)


# 5. three documents: #1 will already exist (duplicate), #2 is an image-only page (unreadable), #3 is new
def three_docs(c):
    licence_page(c, 'Unity Services W.L.L', 'LIC-500500', '75005-1', issue='01/01/2026', expiry='31/12/2030')
    stamp_only_page(c)
    licence_page(c, 'Unity Services W.L.L', 'LIC-500501', '75005-1', issue='01/01/2026', expiry='31/12/2030')


build('three_docs.pdf', three_docs)


# 6. one document over two pages
def spanning(c):
    licence_page(c, 'Vertex Marine W.L.L', 'LIC-600600', '76006-1', issue='01/07/2026', expiry='30/06/2030', marker='Page 1 of 2')
    lines(c, ['Vertex Marine W.L.L', '# Commercial Trade Licence (continued)', 'Licence No: LIC-600600',
              'Terms: the holder must display this licence at the premises at all times.',
              'Any change of activity must be notified to the authority in writing.', 'Page 2 of 2'])
    c.showPage()


build('spanning_two_pages.pdf', spanning)

# 7. no CR No or Licence No at all
build('no_identifier.pdf', lambda c: lines(c, ['Willow Trading W.L.L', '# Certificate of Appreciation',
                                                'This certificate is presented to the staff for their dedication during the year.',
                                                'Issue Date: 01/02/2026', 'Expiry Date: 31/01/2030']) or c.showPage())

# 8. password protected
buffer, c = new_pdf()
licence_page(c, 'Xenon Power W.L.L', 'LIC-800800', '78008-1', issue='01/01/2026', expiry='31/12/2030')
c.save()
reader = PdfReader(io.BytesIO(buffer.getvalue()))
writer = PdfWriter()
for page in reader.pages:
    writer.add_page(page)
writer.encrypt('open-sesame')
protected = io.BytesIO()
writer.write(protected)
write('password_protected.pdf', protected)

# 9. corrupted (valid header, broken body) and 10. not a PDF at all
if not os.path.exists(os.path.join(OUT, 'corrupted.pdf')):
  with open(os.path.join(OUT, 'corrupted.pdf'), 'wb') as handle:
    handle.write(b'%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' + b'\x00\x13broken-bytes' * 40)
if not os.path.exists(os.path.join(OUT, 'not_a_pdf.pdf')):
  with open(os.path.join(OUT, 'not_a_pdf.pdf'), 'wb') as handle:
    handle.write(b'This is just a text file renamed to .pdf, not a PDF document.\n')



def policy_page(c, company, policy, issue, expiry):
    lines(c, [company, '# Insurance Policy Certificate', f'Policy No: {policy}', f'Company Name: {company}',
              'Cover: public liability for the premises and staff', f'Issue Date: {issue}', f'Expiry Date: {expiry}'])
    c.showPage()


# 11. a document with only a reference (policy) number - no CR No, no License No
build('reference_only.pdf', lambda c: policy_page(c, 'Yardley Holdings W.L.L', 'POL-77001', '01/02/2026', '31/01/2030'))


# 12. two such documents in one PDF, told apart by their reference numbers
def two_policies(c):
    policy_page(c, 'Zenith Shipping W.L.L', 'POL-88001', '01/03/2026', '28/02/2030')
    policy_page(c, 'Zenith Shipping W.L.L', 'POL-88002', '01/03/2026', '28/02/2030')


build('two_policies.pdf', two_policies)

print('written to', OUT)
for name in sorted(os.listdir(OUT)):
    print(f'  {name}  {os.path.getsize(os.path.join(OUT, name))} bytes')
