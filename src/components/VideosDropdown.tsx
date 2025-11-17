import React, { useState } from "react";
import { VideoData, VideosDropDownProps } from "@/types";
import LoadingSpinner from "./LoadingSpinner";
import { DropdownIcon } from "./icons";

const VideosDropDown: React.FC<VideosDropDownProps> = ({
  onVideoChange,
  videosData,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  isLoading,
  selectedFile,
  taskId,
  footageVideoId,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (videoId: string) => {
    onVideoChange(videoId);
    setIsOpen(false);
  };

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  };

  // Find the selected video name
  const selectedVideo = videosData?.pages
    .flatMap((page: { data: VideoData[] }) => page.data)
    .find((video: VideoData) => video._id === footageVideoId);

  const selectedVideoName =
    selectedVideo?.system_metadata?.filename || "Select a video";

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full my-5">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-sm h-10 px-[18px] py-2 bg-stone-900/0 rounded-xl shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.10)] outline outline-1 outline-gray-700 inline-flex justify-start items-center gap-1">
      {/* <div className="relative w-full max-w-lg mx-auto border border-black rounded-xl"> */}
      {/* Dropdown button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!!selectedFile || !!taskId}
        className="cursor-pointer w-full text-left bg-gray-100 rounded-3xl text-black text-lg relative"
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <div className="flex justify-between items-center">
          <div
            className="truncate pr-8"
            title={selectedVideoName}
            style={{
              maxWidth: "calc(100% - 2rem)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {selectedVideoName}
          </div>
          <div
            className="text-lg transform transition-transform duration-200 align-center"
            style={{
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <DropdownIcon />
          </div>
        </div>
      </button>

      {/* Dropdown content */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-1 max-h-[40vh] overflow-y-auto bg-white border border-gray-200 rounded-xl z-50 p-2"
          onScroll={handleScroll}
          style={{
            width: "100%",
            top: "100%",
          }}
        >
          {videosData?.pages.map(
            (page: { data: VideoData[] }, pageIndex: number) => (
              <div key={`page-${pageIndex}`} className="flex flex-col gap-1">
                {page.data.map((video: VideoData) => (
                  <button
                    key={`${pageIndex}-${video._id}`}
                    className={`cursor-pointer rounded-2xl text-left py-2 px-4 hover:bg-gray-100 last:border-0 w-full ${
                      video._id === footageVideoId ? "bg-gray-200" : ""
                    }`}
                    style={{ fontFamily: "var(--font-sans)" }}
                    onClick={() => handleChange(video._id)}
                    title={video.system_metadata?.filename}
                  >
                    <div
                      className="text-md"
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        maxWidth: "100%",
                      }}
                    >
                      {video.system_metadata?.filename}
                    </div>
                  </button>
                ))}
              </div>
            )
          )}

          {isFetchingNextPage && (
            <div className="flex justify-center items-center p-4">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideosDropDown;
