#!/usr/bin/env python3
"""MCP server: lets Claude Code (or any MCP client) turn PDF pages into MusicXML with the same pipeline as pdf2xml.py.

Register it (from the repo root):  claude mcp add piano-omr -- tools/omr/.venv/bin/python tools/omr/mcp_server.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp.server.fastmcp import FastMCP
import pdf2xml

mcp = FastMCP('piano-omr')


@mcp.tool()
def pdf_to_musicxml(pdf_path: str, pages: str, title: str, composer: str, crop: str = '', dpi: int = 300) -> str:
    """Read sheet music from PDF pages (optical music recognition, homr) and write MusicXML for the piano course.

    pages: '8', '8-10' or '8,10-12' (1-based). crop: optional 'x0,y0,x1,y1' fractions of the page (top left origin) to read just one
    piece: a page with several pieces otherwise comes out as one score. Files whose bars all add up go to the repo inbox (next step:
    ./ingest.sh); the others go to tools/omr/review/ to fix by hand. Pitch and rhythm only: no dynamics, slurs or fingering.
    About 5 s per system on a CPU. Each result names an image that shows what was read, so look at it before trusting the notes.
    """
    box = None
    if crop.strip():
        box = tuple(float(x) for x in crop.split(','))
        if len(box) != 4 or not (0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1):
            return 'crop must be x0,y0,x1,y1 with 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1'
    try:
        results = pdf2xml.convert(pdf_path, pdf2xml.parse_pages(pages), title, composer, dpi, box)
    except (FileNotFoundError, ValueError, RuntimeError) as e:
        return f'Error: {e}'
    return '\n'.join(pdf2xml.describe(r) for r in results)


if __name__ == '__main__':
    mcp.run()
