import { useState } from 'react';
import type { QaResult } from '../types/qa';

const DEFAULT_VISIBLE_SOURCES = 3;
const MAX_SOURCES = 5;

interface HudProps {
  result: QaResult;
}

export function Hud({ result }: HudProps) {
  const [expanded, setExpanded] = useState(false);

  const sources = result.sources.slice(0, MAX_SOURCES);
  const visibleSources = expanded ? sources : sources.slice(0, DEFAULT_VISIBLE_SOURCES);
  const canExpand = sources.length > DEFAULT_VISIBLE_SOURCES;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 rounded-2xl bg-white p-6 shadow-lg">
      {/* 1층: 핵심 요약 */}
      <p
        className="text-gray-900"
        style={{ fontSize: '19px', fontWeight: 500, lineHeight: 1.5 }}
      >
        {result.snippet}
      </p>

      {/* 2층: 키워드 */}
      <div className="flex flex-wrap gap-2">
        {result.keywords.map((keyword) => (
          <span
            key={keyword}
            className="rounded-full bg-blue-50 px-3 py-1 text-blue-800"
            style={{ fontSize: '15px' }}
          >
            {keyword}
          </span>
        ))}
      </div>

      {/* 3층: 근거 자료 */}
      <div className="flex flex-col gap-2">
        {visibleSources.map((source, index) => (
          <div
            key={`${source.slide}-${index}`}
            className="rounded-lg bg-gray-50 px-4 py-3 text-gray-800"
            style={{ fontSize: '16px' }}
          >
            슬라이드 {source.slide}p — "{source.quote}"
          </div>
        ))}

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          disabled={!canExpand}
          className="mt-1 self-start rounded-md px-3 py-1.5 text-sm font-medium text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400 enabled:hover:bg-blue-50"
        >
          {expanded ? '접기' : '더보기'}
        </button>
      </div>
    </div>
  );
}
