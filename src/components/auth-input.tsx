/**
 * WHY: Shared labeled input for auth forms (login + signup).
 *
 * Login and signup both render the same label + input + focus-ring pattern.
 * Extracting it here eliminates ~10 lines of identical markup per field,
 * which also brings the parent page components back under the 100-line limit
 * required by the Global Code Standards.
 */

interface AuthInputProps {
  id: string;
  label: string;
  type: 'email' | 'password' | 'text';
  value: string;
  placeholder: string;
  autoComplete: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function AuthInput({
  id,
  label,
  type,
  value,
  placeholder,
  autoComplete,
  onChange,
}: AuthInputProps) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={onChange}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder-zinc-400 focus:border-black focus:outline-none dark:border-zinc-700 dark:bg-black dark:text-white dark:placeholder-zinc-600 dark:focus:border-white"
      />
    </div>
  );
}
