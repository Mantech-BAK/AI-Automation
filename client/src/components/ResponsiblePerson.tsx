interface ResponsiblePersonProps {
  // The stored value: an email address or a manually typed name.
  value?: string | null;
  // Display name resolved by the server (only present for emails).
  resolvedName?: string | null;
  // Show the email under the name instead of only as a tooltip.
  showEmail?: boolean;
  className?: string;
}

export function looksLikeEmail(value?: string | null): boolean {
  return Boolean(value && value.includes('@'));
}

// Emails render as the person's display name linked with mailto:; plain text
// names render as stored.
export default function ResponsiblePerson({ value, resolvedName, showEmail = false, className = '' }: ResponsiblePersonProps) {
  if (!value) return <span className={className}>-</span>;
  if (!looksLikeEmail(value)) return <span className={className}>{value}</span>;

  const name = resolvedName || value;
  return (
    <span className={className}>
      <a href={`mailto:${value}`} title={value} className="text-blue-600 hover:underline">
        {name}
      </a>
      {showEmail && name !== value && <span className="block text-xs text-slate-400">{value}</span>}
    </span>
  );
}
