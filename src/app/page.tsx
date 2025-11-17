"use client";

import { useState } from "react";
import clsx from "clsx";
import CreatorBrandMatch from "./creator-brand-match/page";
import BrandMentionDetection from "./brand-mention-detection/page";
import SemanticSearch from "./semantic-search/page";
import { GlobalLogoSvg } from "@/components/icons";

type TabType =
  | "creator-brand-match"
  | "brand-mention-detection"
  | "semantic-search";

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("creator-brand-match");

  const tabs = [
    {
      id: "creator-brand-match" as TabType,
      label: "Creator Brand Match",
      // icon: (
      //   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      //     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      //   </svg>
      // ),
      description:
        "Find the perfect creator-brand matches based on content analysis and audience alignment",
    },
    {
      id: "brand-mention-detection" as TabType,
      label: "Brand Mention Detection",
      // icon: (
      //   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      //     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      //   </svg>
      // ),
      description:
        "Analyze videos to detect brand mentions and track brand presence across creator content",
    },
    {
      id: "semantic-search" as TabType,
      label: "Semantic Search",
      // icon: (
      //   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      //     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      //   </svg>
      // ),
      description:
        "Search through video content using natural language and AI-powered semantic understanding",
    },
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case "creator-brand-match":
        return <CreatorBrandMatch />;
      case "brand-mention-detection":
        return <BrandMentionDetection />;
      case "semantic-search":
        return <SemanticSearch />;
      default:
        return <CreatorBrandMatch />;
    }
  };

  return (
    <div
      className="h-screen flex overflow-hidden"
      style={{ backgroundColor: "var(--zinc-100)" }}
    >
      {/* Left Sidebar */}
      <div
        className="w-48 flex flex-col gap-6 p-6 h-screen sticky top-0"
        style={{ backgroundColor: "var(--zinc-100)" }}
      >
        {/* Header */}
        <div>
          <h1 className="text-gra-700 text-2xl font-normal font-['Milling']">
            Creator Discovery
          </h1>
          {/* <p className="text-sm" style={{ color: 'var(--zinc-700)' }}>Discover creators, analyze brand mentions, and find the perfect matches using AI-powered video analysis</p> */}
        </div>

        {/* Navigation */}
        <nav className="flex flex-col flex-1 gap-6">
          <div className=" pl-1 border-l border-stone-300 flex flex-col gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "block w-full text-left px-3 py-2 rounded-lg transition-colors font-normal text-sm h-14 font-['Milling'] leading-tight"
                )}
                style={{
                  backgroundColor:
                    activeTab === tab.id
                      ? "var(--color-gray-500)"
                      : "transparent",
                  color: "var(black)",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor =
                      "var(--color-gray-200)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 h-full border-l border-stone-300" />
        </nav>
        <GlobalLogoSvg />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">{renderActiveTab()}</div>
    </div>
  );
}
