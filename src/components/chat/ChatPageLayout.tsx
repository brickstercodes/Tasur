'use client';

import React, { useState } from 'react';
import { FocusZone } from './FocusZone';

type Tab = 'chat' | 'focus';

// Re-export FocusZone props so chat/page.tsx can pass them through
export interface FocusZonePassthroughProps {
  sessionId: string;
  conceptName: string;
  prerequisites: string[];
  studyCue?: string;
  documentText?: string;
  documentFileName?: string;
  documentUrl?: string;
  documentFileType?: string;
}

interface ChatPageLayoutProps {
  chatSlot: React.ReactNode;
  focusZoneProps: FocusZonePassthroughProps;
  hasDocument: boolean;
}

export function ChatPageLayout({ chatSlot, focusZoneProps, hasDocument }: ChatPageLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <>
      {/* Mobile-only tab toggle — hidden on desktop via CSS */}
      {hasDocument && (
        <div className="chat-mobile-tab-bar">
          <button
            type="button"
            className={`chat-mobile-tab-btn${activeTab === 'chat' ? ' active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={`chat-mobile-tab-btn${activeTab === 'focus' ? ' active' : ''}`}
            onClick={() => setActiveTab('focus')}
          >
            Document
          </button>
        </div>
      )}

      {/*
       * Both columns stay mounted at all times — the inactive one gets
       * display:none via .chat-col-inactive, which preserves the iframe's
       * internal scroll position across tab switches.
       */}
      <div
        className="chat-page-outer"
        style={{
          display: 'flex',
          flexDirection: 'row',
          height: 'calc(100vh - 112px)',
          gap: 0,
          marginLeft: -24,
          marginRight: -24,
        }}
      >
        {/* Chat column */}
        <div
          className={`chat-page-col-chat${activeTab === 'focus' ? ' chat-col-inactive' : ''}`}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '0 24px',
            overflow: 'hidden',
          }}
        >
          {chatSlot}
        </div>

        {/*
         * FocusZone receives its class directly on the <aside> via the
         * className prop — no wrapper div needed, so the aside stays a
         * direct flex child and its width: 50% resolves correctly.
         */}
        <FocusZone
          {...focusZoneProps}
          className={`chat-page-col-focus${activeTab === 'chat' && hasDocument ? ' chat-col-inactive' : ''}`}
        />
      </div>
    </>
  );
}
