"""Optional live smoke check: synthetic PDF only; never reads the user's résumé."""
import base64
import json
import urllib.request


def synthetic_pdf():
    text = b'BT /F1 12 Tf 50 750 Td (Built Vue asset interfaces with filtering and REST APIs.) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        b'<< /Length ' + str(len(text)).encode() + b' >>\nstream\n' + text + b'\nendstream']
    pdf = b'%PDF-1.4\n'
    offsets = [0]
    for i, body in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += str(i).encode() + b' 0 obj\n' + body + b'\nendobj\n'
    start = len(pdf)
    pdf += b'xref\n0 6\n0000000000 65535 f \n'
    pdf += b''.join(('%010d 00000 n \n' % o).encode() for o in offsets[1:])
    return pdf + b'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + str(start).encode() + b'\n%%EOF'


def post(route, payload):
    request = urllib.request.Request('http://localhost:8000/api/' + route,
        data=json.dumps(payload).encode(), headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)

if __name__ == '__main__':
    result = post('import', {'name':'synthetic-resume.pdf','content':base64.b64encode(synthetic_pdf()).decode()})
    assert 'Built Vue asset interfaces' in result['text']
    print('PDF text extraction: passed', flush=True)
    result_ai = post('ai/parse', {'sourceText':result['text']})
    assert result_ai.get('experiences'), 'No experience entries returned.'
    assert all(e.get('sourceQuote') and e['sourceQuote'] in result['text'] for e in result_ai['experiences'])
    print('Configured AI analysis: passed; %d source-backed entries.' % len(result_ai['experiences']))
