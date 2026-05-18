/**
 * Store an error message on the session for later display.
 *
 * @param {import("express").Request} req Express request.
 * @param {string} msg error message.
 */
export function sessionError(req, msg) {
  req.session.error = msg;
}
