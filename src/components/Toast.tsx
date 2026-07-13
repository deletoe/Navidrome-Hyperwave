import { AppIcon } from "./AppIcon";

export interface ToastProps {
  message?: string;
  tone?: "info" | "success" | "error";
  onDismiss: () => void;
}

export function Toast({ message, tone = "info", onDismiss }: ToastProps) {
  if (!message) {
    return <div className="toast-region" aria-live="polite" aria-atomic="true" />;
  }

  return (
    <div className="toast-region" aria-live={tone === "error" ? "assertive" : "polite"}>
      <div className={`toast toast--${tone}`} role={tone === "error" ? "alert" : "status"}>
        <p>{message}</p>
        <button
          className="icon-button"
          type="button"
          aria-label="Dismiss notification"
          title="Dismiss notification"
          onClick={onDismiss}
        >
          <AppIcon name="close" />
        </button>
      </div>
    </div>
  );
}
