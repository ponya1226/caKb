import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useState } from "react";
import { copyTextToClipboard } from "../lib/clipboard";

type CopyStatus = "idle" | "success" | "error";

type CopyTextButtonProps = {
  text: string;
  label?: string;
};

export function CopyTextButton({ text, label = "コピー" }: CopyTextButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status === "idle") {
      return undefined;
    }

    const timerId = window.setTimeout(() => setStatus("idle"), 2400);
    return () => window.clearTimeout(timerId);
  }, [status]);

  async function handleCopy() {
    const copied = await copyTextToClipboard(text);
    setStatus(copied ? "success" : "error");
  }

  const feedback = status === "success" ? "コピーしました" : status === "error" ? "コピーできませんでした" : "";

  return (
    <div className="copy-control">
      <button className="button button-secondary button-compact" type="button" onClick={handleCopy} disabled={!text}>
        {status === "success" ? <Check size={17} aria-hidden="true" /> : <ClipboardCopy size={17} aria-hidden="true" />}
        {status === "success" ? "コピー済み" : label}
      </button>
      {feedback && (
        <span className={status === "error" ? "copy-feedback error" : "copy-feedback"} role={status === "error" ? "alert" : "status"}>
          {feedback}
        </span>
      )}
    </div>
  );
}
