import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { errorMiddleware } from './error.middleware';

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

const req = {} as Request;
const next = jest.fn() as unknown as NextFunction;

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => jest.restoreAllMocks());

describe('errorMiddleware', () => {
  it('returns 413 for MulterError LIMIT_FILE_SIZE', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE');
    const res = makeRes();
    errorMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_TOO_LARGE' }));
  });

  it('returns 415 for unsupported file type errors', () => {
    const err = new Error('Unsupported file type: audio/x-exotic');
    const res = makeRes();
    errorMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT' }));
  });

  it('returns 500 for generic errors', () => {
    const err = new Error('Something went wrong');
    const res = makeRes();
    errorMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });

  it('returns 500 with fallback message when error has no message', () => {
    const err = new Error('');
    const res = makeRes();
    errorMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe('Internal server error');
  });
});
