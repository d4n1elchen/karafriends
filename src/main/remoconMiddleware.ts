import path from "path";

import isDev from "electron-is-dev";
import express, { Request, Response } from "express";
import fetch from "node-fetch";

function remoconMiddleware() {
  if (isDev) {
    // On dev, we should proxy non-graphql requests to the remocon dev server
    return (req: Request, res: Response, next: () => void) => {
      if (req.path === "/graphql") {
        next();
        return;
      }
      fetch(`http://localhost:3000/remocon${req.originalUrl}`, {
        method: req.method,
        headers: Object.keys(req.headers).map((header) => [
          header,
          req.headers[header] as string,
        ]),
      }).then((proxiedRes) => {
        res.status(proxiedRes.status);
        Object.entries(proxiedRes.headers).forEach((header) =>
          res.append(...header)
        );
        proxiedRes.arrayBuffer().then((buf) => {
          res.send(Buffer.from(buf));
        });
      });
    };
  } else {
    // On prod, we can just serve up the built remocon bundle
    return express.static(path.join(__dirname, "..", "remocon"));
  }
}

export default remoconMiddleware;
