import { describe, expect, it } from 'vitest';
import { highlightLines } from './highlight';
describe('code preview tokenization', () => {
  it('preserves TSX text and offsets for multiline comments and CRLF', () => {
    const content = '/* hello\r\n world */\r\nexport const App = () => <Button />;';
    const lines = highlightLines('App.tsx', content);
    expect(lines.map(line => line.segments.map(segment => segment.text).join(''))).toEqual(content.split('\r\n'));
    expect(lines[2].offset).toBe(content.indexOf('export'));
    for (const line of lines) for (const segment of line.segments) expect(content.slice(segment.offset, segment.offset + segment.text.length)).toBe(segment.text);
    expect(lines[0].segments.some(segment => segment.classes.includes('comment'))).toBe(true);
  });
  it('renders unknown languages as safe text and retains trailing empty lines', () => {
    const lines = highlightLines('file.unknown', '<script>alert(1)</script>\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].segments[0].text).toBe('<script>alert(1)</script>');
    expect(lines[1].segments).toEqual([]);
  });
});
