import type { ServerProvider } from "@orchestrate/contracts";

interface ProviderHealthBannerProps {
  status: ServerProvider | null;
}

export function ProviderHealthBanner({ status }: ProviderHealthBannerProps) {
  if (!status || status.status === "ready") return null;

  const message =
    status.message ??
    (status.status === "error"
      ? "Provider encountered an error."
      : status.status === "warning"
        ? "Provider has warnings."
        : "Provider is disabled.");

  return (
    <div
      className={`px-4 py-2 text-sm ${
        status.status === "error"
          ? "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
          : status.status === "warning"
            ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200"
            : "bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400"
      }`}
    >
      {message}
    </div>
  );
}
