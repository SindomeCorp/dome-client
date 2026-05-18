import { getSocket } from "../s-editor.js";

const isReadOnly = (cmd) => cmd == "none" || !cmd;

export const setupEditor = ({ uploadCommand, editorName, cta }) => {
  document.title = (isReadOnly(uploadCommand) ? "Viewing " : "Editing ") + editorName;
  if (cta) cta.innerHTML = uploadCommand;
};

export const attachUpload = ({
  uploadCommand,
  cta,
  getUploadData,
  setInitial,
  validate = () => true,
  onSuccess = () => {},
  onError = () => {}
}) => {
  if (!cta) return;
  cta.addEventListener("click", () => {
    if (isReadOnly(uploadCommand)) return;
    const uploadData = getUploadData();
    if (!validate(uploadData)) {
      onError();
      return;
    }
    const socket = getSocket();
    socket.emit("input", uploadCommand);
    socket.emit("input", uploadData + "\n.");
    setInitial(uploadData);
    onSuccess();
  });
};

export const attachAbort = ({ abortButton, getValue, initialValueRef, onAbort }) => {
  if (!abortButton) return;
  abortButton.addEventListener("click", () => {
    const val = getValue();
    if (val == initialValueRef.value || window.confirm("Abort editing and lose your changes?")) {
      onAbort();
    }
  });
};
