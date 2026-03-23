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
        className="block text-sm font-medium"
        style={{ color: 'var(--text-muted)' }}
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
        className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
        style={{
          border: '1px solid var(--input-border)',
          background: 'var(--input-bg)',
          color: 'var(--text)',
        }}
      />
    </div>
  );
}
