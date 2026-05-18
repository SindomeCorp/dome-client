import React from "react";
import { createRoot } from "react-dom/client";
import EditorIDE from "../react/EditorIDE.jsx";

export default {};

document.addEventListener("DOMContentLoaded", () => {
  const root = createRoot(document.getElementById("root"));
  root.render(<EditorIDE />);
});
