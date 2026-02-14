export default function EmptyState({
  icon = '📭',
  title,
  description,
  action,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-6xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-zinc-900 mb-2">{title}</h3>
      <p className="text-sm text-zinc-600 text-center mb-6 max-w-md">
        {description}
      </p>
      {action && <div>{action}</div>}
    </div>
  )
}
