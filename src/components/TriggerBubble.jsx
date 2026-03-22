import { useState } from 'react';
import { detectTrigger, formatTriggerMessage } from '../lib/triggerRouter';

/**
 * TriggerBubble — Renders trigger messages ([WORK]:, [CLAW]:, [CHROME]:,
 * [RESULT]:, [ERROR]:) in the session chat with styled formatting.
 *
 * Props:
 *   content   — raw message content string
 *   type      — optional pre-detected trigger type; auto-detected if omitted
 *   timestamp — ISO timestamp string
 *   agentName — display name of the agent
 */
export default function TriggerBubble({ content, type, timestamp, agentName }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const triggerType = type || detectTrigger(content);
  if (!triggerType) return null;

  const { icon, label, borderColor, bgColor, data } = formatTriggerMessage(content, triggerType);

  const formattedData = data
    ? typeof data === 'object' && !data.raw
      ? JSON.stringify(data, null, 2)
      : data.raw || String(data)
    : null;

  const handleCopy = async () => {
    if (!formattedData) return;
    try {
      await navigator.clipboard.writeText(formattedData);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      className="rounded-lg my-2 overflow-hidden"
      style={{
        background: bgColor,
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: borderColor }}
          >
            {label}
          </span>
          {agentName && (
            <span className="text-xs text-slate-400 ml-1">
              {agentName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {formattedTime && (
            <span className="text-[10px] text-slate-500">{formattedTime}</span>
          )}
          <span
            className="text-xs text-slate-400 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            &#9660;
          </span>
        </div>
      </div>

      {/* Summary line (always visible) */}
      {data && (
        <div className="px-3 pb-2 text-xs text-slate-300 truncate">
          {data.command && <span>Command: <code className="text-amber-300">{data.command}</code></span>}
          {data.action && !data.command && <span>Action: <code className="text-blue-300">{data.action}</code></span>}
          {data.skill && <span className="ml-2">Skill: <code className="text-green-300">{data.skill}</code></span>}
          {data.error && <span className="text-red-400">{String(data.error).slice(0, 80)}</span>}
          {data.output && typeof data.output === 'string' && (
            <span className="text-green-300">{data.output.slice(0, 80)}</span>
          )}
        </div>
      )}

      {/* Expandable JSON content */}
      {expanded && formattedData && (
        <div className="relative border-t" style={{ borderColor: `${borderColor}33` }}>
          <pre
            className="px-3 py-2 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto"
            style={{ background: 'rgba(0,0,0,0.15)' }}
          >
            {formattedData}
          </pre>

          {/* Copy button */}
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="absolute top-1 right-2 text-[10px] px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}
