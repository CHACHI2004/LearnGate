import type { RequestHandler } from "express";

export function asyncHandler(controller: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(controller(request, response, next)).catch(next);
  };
}
