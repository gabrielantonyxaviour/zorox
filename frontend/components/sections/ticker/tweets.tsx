import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { TokenData } from "@/lib/types";
import Image from "next/image";
import React, { useEffect, useRef } from "react";

export default function Tweets({
  symbol,
  growth,
  tweets,
}: {
  symbol: string;
  growth: string;
  tweets: any[];
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    let scrollInterval: NodeJS.Timeout;
    let isAtEnd = false;

    const startScrolling = () => {
      scrollInterval = setInterval(() => {
        if (scrollContainer) {
          if (!isAtEnd) {
            scrollContainer.scrollLeft += 1;
            if (
              scrollContainer.scrollLeft + scrollContainer.clientWidth >=
              scrollContainer.scrollWidth
            ) {
              isAtEnd = true;
            }
          } else {
            scrollContainer.scrollLeft -= 1;
            if (scrollContainer.scrollLeft <= 0) {
              isAtEnd = false;
            }
          }
        }
      }, 30);
    };

    const stopScrolling = () => {
      clearInterval(scrollInterval);
    };

    if (scrollContainer) {
      startScrolling();

      const container = scrollContainer;
      container.onmouseenter = stopScrolling;
      container.onmouseleave = startScrolling;
    }

    return () => {
      stopScrolling();
      if (scrollContainer) {
        scrollContainer.onmouseenter = null;
        scrollContainer.onmouseleave = null;
      }
    };
  }, []);
  function timeAgo(timestamp: string): string {
    const now = new Date();
    const timeDifferenceInSeconds = Math.floor(
      (now.getTime() - new Date(timestamp).getTime()) / 1000
    );

    const timeDifferenceInMinutes = Math.floor(timeDifferenceInSeconds / 60);
    const timeDifferenceInHours = Math.floor(timeDifferenceInMinutes / 60);
    const timeDifferenceInDays = Math.floor(timeDifferenceInHours / 24);

    if (timeDifferenceInSeconds < 60) {
      return `${timeDifferenceInSeconds}s ago`;
    } else if (timeDifferenceInMinutes < 60) {
      return `${timeDifferenceInMinutes}m ago`;
    } else if (timeDifferenceInHours < 24) {
      return `${timeDifferenceInHours}h ago`;
    } else if (timeDifferenceInDays < 7) {
      return `${timeDifferenceInDays}d ago`;
    } else {
      return `${Math.floor(timeDifferenceInDays / 7)}wk ago`;
    }
  }

  // Usage example:
  const timestamp = "2024-12-07T12:00:00Z"; // Example timestamp
  console.log(timeAgo(timestamp)); // Output: "x hours ago" or "y minutes ago"

  return (
    <>
      <div className="flex justify-between sen my-12 items-center">
        <div className="flex flex-col ">
          <p className="text-2xl font-bold nouns tracking-widest text-[#F8D12E]">
            ZoroX Tweets
          </p>
          <p className="text-md text-muted-foreground font-semibold">
            View all tweets made by ZoroX about ${symbol.toUpperCase()}
          </p>
        </div>
        <p className="pr-2 font-semibold">
          <span className="text-green-500 font-bold mr-1">{growth}x</span>{" "}
          growth since first tweet
        </p>
      </div>
      <ScrollArea className="w-[1200px] m-2">
        <div
          ref={scrollContainerRef}
          className="flex space-x-2 p-2 overflow-x-hidden"
        >
          {tweets.map((tweet, index) => (
            <Card
              key={index}
              className="rounded-lg mt-2 mb-4 transform transition-all duration-300 hover:scale-105 hover:border hover:border-[1px] hover:border-[#F8D12E] cursor-pointer"
              onClick={() => {
                console.log("tweet", tweet);
                window.open(
                  "https://x.com/TokenHunterZoro/status/1867331863993627085",
                  "_blank"
                );
              }}
            >
              <CardContent className="p-4 w-[300px] sen">
                <div className="flex items-center space-x-2">
                  <Image
                    src={"/logo.jpg"}
                    width={28}
                    height={28}
                    alt="zoro"
                    className="rounded-full"
                  />
                  <div className="flex flex-col justify-center">
                    <p className="text-md font-bold text-white leading-tight">
                      ZoroX
                    </p>
                    <p className="text-xs font-medium text-muted-foreground">
                      @TokenHunterZoro
                    </p>
                  </div>
                  <div className="flex-1 flex justify-end">
                    <p className="text-xs text-gray-400">
                      {timeAgo(tweet.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div>
                    <div className="flex items-center justify-between"></div>
                    <p className="text-sm text-white mt-2">{tweet.tweet}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </>
  );
}
