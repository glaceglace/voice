import { FormatTimePipe } from './format-time.pipe';

describe('FormatTimePipe', () => {
  const pipe = new FormatTimePipe();

  it('formats 0 seconds', () => {
    expect(pipe.transform(0)).toBe('0:00.00');
  });

  it('formats sub-minute duration', () => {
    expect(pipe.transform(5.5)).toBe('0:05.50');
  });

  it('formats exactly 1 minute', () => {
    expect(pipe.transform(60)).toBe('1:00.00');
  });

  it('formats over 1 minute with milliseconds', () => {
    expect(pipe.transform(75.25)).toBe('1:15.25');
  });

  it('pads single-digit seconds with zero', () => {
    expect(pipe.transform(1)).toBe('0:01.00');
  });
});
