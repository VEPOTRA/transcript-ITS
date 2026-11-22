"use client";

type PasswordVisibilityToggleProps = {
  visible: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export function PasswordVisibilityToggle({
  visible,
  onToggle,
  disabled = false,
}: PasswordVisibilityToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      disabled={disabled}
      className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3 text-gray-500 transition-colors hover:text-indigo-800 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-indigo-300"
    >
      {visible ? <EyeSlashIcon /> : <EyeIcon />}
    </button>
  );
}

function EyeIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.5-6.25 9.75-6.25S21.75 12 21.75 12 18.25 18.25 12 18.25 2.25 12 2.25 12Z"
      />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

function EyeSlashIcon() {
  return (
    <svg
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m3 3 18 18M10.58 10.59a2 2 0 0 0 2.83 2.83"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.88 5.1A10.7 10.7 0 0 1 12 4.9c6.25 0 9.75 7.1 9.75 7.1a17 17 0 0 1-3.1 3.9M6.23 6.24C3.68 8.03 2.25 12 2.25 12s3.5 7.1 9.75 7.1a10.7 10.7 0 0 0 5.02-1.22"
      />
    </svg>
  );
}
