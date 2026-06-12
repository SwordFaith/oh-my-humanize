Convert Mermaid graph source into terminal-friendly text diagram output.

Parameters:
- `mermaid` (required): Mermaid graph text to render.
- `config` (optional): JSON render configuration (spacing and layout options).

Behavior:
- Returns Unicode box-drawing diagram text by default, with ASCII output only when `config.useAscii` is true.
- Saves full output to `artifact://<id>`.
