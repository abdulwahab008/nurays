import express, { Request, Response, Router } from 'express';
import path from 'path';
import { storage, LocalStorage } from './index';
import { legacyUploadsDir } from '../services/upload.service';

const fileHeaders = (res: Response) => {
  // Never let a browser sniff an upload into something executable, nor render it as a page.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
};

/**
 * HTTP serving for the local storage driver (with STORAGE_DRIVER=s3 the object store
 * / CDN serves files and these routes only keep legacy uploads working):
 *  - /media/...           public objects, cached for a year (keys are never reused)
 *  - /files/<key>?exp&sig private objects, only with a valid unexpired signature
 *  - /uploads/products/... files uploaded before the storage layer (public as before)
 */
export function fileRoutes(): Router {
  const router = Router();
  const s = storage();

  router.use(
    '/uploads/products',
    express.static(legacyUploadsDir, { dotfiles: 'deny', index: false, setHeaders: fileHeaders })
  );

  if (s instanceof LocalStorage) {
    router.use(
      '/media',
      express.static(s.dirFor('public'), {
        dotfiles: 'deny',
        index: false,
        immutable: true,
        maxAge: '365d',
        setHeaders: fileHeaders,
      })
    );

    router.get(/^\/files\/(.+)$/, (req: Request, res: Response) => {
      let key: string;
      try {
        key = decodeURIComponent((req.params as any)[0] ?? '');
      } catch {
        res.status(400).json({ success: false, error: { message: 'This link is invalid', code: 'FILE_LINK_INVALID' } });
        return;
      }
      const exp = Number(req.query.exp);
      const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
      if (!key.startsWith('x/') || key.includes('..') || !s.verify(key, exp, sig)) {
        res.status(403).json({ success: false, error: { message: 'This link is invalid or has expired', code: 'FILE_LINK_INVALID' } });
        return;
      }
      let file: string;
      try {
        file = s.pathFor(key, 'private');
      } catch {
        res.status(404).end();
        return;
      }
      fileHeaders(res);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(file)}"`);
      res.sendFile(file, { dotfiles: 'deny' }, (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    });
  }
  return router;
}
