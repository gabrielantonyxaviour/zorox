import puppeteer from "puppeteer-extra";
// import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs";
// import os from "os";
// import path from "path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { extractComments, VideoScraper } from "./scraper.mjs";
dotenv.config();

const logger = {
  info: (...args) => console.log(new Date().toISOString(), "INFO:", ...args),
  error: (...args) =>
    console.error(new Date().toISOString(), "ERROR:", ...args),
};

const processedTiktokIds = new Set();

const setupBrowser = async () => {
  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/browser/08f25029-10ab-44fb-bd1a-705c827407a3',
      defaultViewport: null
    });
    return browser;
  } catch (e) {
    logger.error(`Failed to connect to browser: ${e.message}`);
    return null;
  }
};

// const setupBrowser = async () => {
//   try {
//     const userDataDir = path.join(
//       os.homedir(),
//       "snap/brave/468/.config/BraveSoftware/Brave-Browser"
//     );

//     const options = {
//       headless: false,
//       ignoreDefaultArgs: ['--enable-automation'],
//       args: [
//         '--no-sandbox',
//         '--disable-setuid-sandbox',
//         `--user-data-dir=${userDataDir}`,
//         '--profile-directory=Profile 2',
//         '--remote-debugging-port=9222'
//       ],
//       executablePath: '/snap/bin/brave',
//       defaultViewport: null
//     };

//     const browser = await puppeteer.launch(options);
//     await new Promise(resolve => setTimeout(resolve, 3000)); // Small delay
//     return browser;
//   } catch (e) {
//     logger.error(`Failed to create browser: ${e.message}`);
//     process.exit(1); // Exit if browser fails to launch
//   }
// };

const verifyPageLoaded = async (page, url, timeout = 60000) => {
  try {
    logger.info(`Loading ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    console.log('waiting for body')
    await page.waitForSelector("body");
    console.log('waiting for timeout')
    await new Promise((resolve) => setTimeout(resolve, 5000));
    logger.info(`Successfully loaded ${url}`);
    return true;
  } catch (e) {
    logger.error(`Error loading page: ${e}`);
    return false;
  }
};
const extractVideoData = async (element) => {
  try {
    const videoData = await VideoScraper.extractVideoData(element);
    return videoData;
  } catch (e) {
    return null;
  }
};

const processSearchTerm = async (page, keyword, maxResults = 50) => {
  const searchUrl = `https://www.tiktok.com/search/video?q=${keyword}`;
  const results = [];
  const scrollPauseTime = 2000;

  try {
    console.log(`\nProcessing search term: ${keyword}`);
    console.log(`Navigating to: ${searchUrl}`);

    if (await verifyPageLoaded(page, searchUrl)) {
      console.log("\nWaiting for video feed...");

      while (results.length < maxResults) {
        // const videoElements = await page.$$('div[class*="DivItemContainerV2"]');
        const videoElements = await page.$$(
          'div[class*="DivItemContainerForSearch"]'
        );

        if (!videoElements.length) {
          console.log("No video elements found. Waiting...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        console.log("Count of Video elements")
        console.log(videoElements.length)

        for (const element of videoElements) {
          if (results.length >= maxResults) break;

          const videoData = await extractVideoData(element);
          const postId = videoData.video_url.split("/").pop();
          if (
            videoData &&
            videoData?.video_url &&
            !processedTiktokIds.has(postId)
          ) {
            console.log(
              `Found video ${results.length}/${maxResults}: ${videoData.video_url}`
            );

            console.log("Extracting Comments")
            videoData.comments = await extractComments(postId);
            console.log(`Found ${videoData.comments.count} comments`);

            processedTiktokIds.add(postId);
            results.push(videoData);
          } else {
            if (processedTiktokIds.has(postId))
              console.log("Video is Already processed")
            else {
              console.log("Video Data is Null")

              console.log(videoData)
            }
          }
        }

        if (results.length >= maxResults) {
          console.log(`\nReached target number of videos for '${keyword}'`);
          break;
        }

        const previousHeight = await page.evaluate(
          "document.documentElement.scrollHeight"
        );
        await page.evaluate(
          "window.scrollTo(0, document.documentElement.scrollHeight)"
        );
        await new Promise((resolve) => setTimeout(resolve, scrollPauseTime));
        const newHeight = await page.evaluate(
          "document.documentElement.scrollHeight"
        );
        if (newHeight === previousHeight) {
          console.log(`\nReached end of feed for '${keyword}'`);
          break;
        }
      }
    }

    return results;
  } catch (e) {
    console.error(`\nError processing search term '${keyword}': ${e}`);
    return results;
  }
};

const processHashtagTerm = async (page, keyword, maxResults = 50) => {
  const hashtagUrl = `https://www.tiktok.com/tag/${keyword}`;
  const results = [];
  const scrollPauseTime = 2000;



  try {
    console.log(`\nProcessing hashtag term: ${keyword}`);
    console.log(`Navigating to: ${hashtagUrl}`);

    if (await verifyPageLoaded(page, hashtagUrl)) {
      console.log("\nWaiting for video feed...");

      while (results.length < maxResults) {
        const videoElements = await page.$$('div[class*="DivItemContainerV2"]');

        if (!videoElements.length) {
          console.log("No video elements found. Waiting...");
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        console.log("Count of Video elements")
        console.log(videoElements.length)
        for (const element of videoElements) {
          if (results.length >= maxResults) break;

          const videoData = await extractVideoData(element);
          const postId = videoData.video_url.split("/").pop();
          if (videoData && videoData?.video_url && !processedTiktokIds.has(postId)) {
            console.log(
              `Found video ${results.length}/${maxResults}: ${videoData.video_url}`
            );

            videoData.comments = await extractComments(postId);
            console.log(`Found ${videoData.comments.count} comments`);

            processedTiktokIds.add(postId);
            results.push(videoData);
          }
        }

        if (results.length >= maxResults) {
          console.log(`\nReached target number of videos for '${keyword}'`);
          break;
        }

        const previousHeight = await page.evaluate(
          "document.documentElement.scrollHeight"
        );
        await page.evaluate(
          "window.scrollTo(0, document.documentElement.scrollHeight)"
        );
        await new Promise((resolve) => setTimeout(resolve, scrollPauseTime));

        const newHeight = await page.evaluate(
          "document.documentElement.scrollHeight"
        );
        if (newHeight === previousHeight) {
          console.log(`\nReached end of feed for '${keyword}'`);
          break;
        }
      }
    }

    return results;
  } catch (e) {
    console.error(`\nError processing hashtag term '${keyword}': ${e}`);
    return results;
  }
};

const saveCombinedResults = (results) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `combined_results_${timestamp}.json`;
    fs.writeFileSync(
      filename,
      JSON.stringify(
        {
          extraction_time: new Date().toISOString(),
          total_searches: results.length,
          results: results,
        },
        null,
        2
      )
    );
    return filename;
  } catch (e) {
    console.error("Error saving results:", e);
    return null;
  }
};

function convertToNumber(value) {
  const units = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const regex = /^(\d+\.?\d*)([KMBT])$/i;

  const match = value.match(regex);
  if (match) {
    const number = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    return number * units[unit];
  }

  const parsedNumber = parseInt(value)
  return !isNaN(parsedNumber) ? parsedNumber : NaN; // Return NaN if the value doesn't match the pattern
}

const upsertTiktoks = async (tiktokEntries) => {
  try {
    console.log(`Upserting ${tiktokEntries.length} tiktok entries...`);
    const { data, error } = await supabase
      .rpc('upsert_tiktok', {
        tiktok_entries: tiktokEntries
      });

    if (error) throw error;
    console.log('Successfully upserted tiktok entries.');
    return data;
  } catch (error) {
    console.error('Error upserting tiktoks:', error);
    throw error;
  }
};

const upsertMentions = async (mentions) => {
  try {
    console.log(`Upserting ${mentions.length} mention entries...`);
    const { data, error } = await supabase
      .rpc('upsert_mentions', {
        mention_entries: mentions
      });

    if (error) throw error;
    console.log('Successfully upserted mention entries.');
    return data;
  } catch (error) {
    console.error('Error upserting mentions:', error);
    throw error;
  }
};

const upsertMentionsInChunks = async (mentions) => {
  const chunkSize = 1500;
  console.log(`Upserting mentions in chunks of ${chunkSize}...`);
  for (let i = 0; i < mentions.length; i += chunkSize) {
    const chunk = mentions.slice(i, i + chunkSize);
    console.log(`Upserting chunk ${i / chunkSize + 1}...`);
    await upsertMentions(chunk);
  }
  console.log('Successfully upserted all mention chunks.');
};

function normalizeObject(data) {
  const result = { ...data };
  for (const mention in data) {
    if (mention.startsWith("https://")) {
      const address = mention.split('/').pop();

      if (result[address]) result[address].count += data[mention].count;
      else result[address] = { ...data[mention] };

      delete result[mention];
    }
  }
  return result;
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const main = async () => {
  const searchTerms = ["memecoin", "solana", "crypto", "pumpfun", 'trading', "degen%20trading", 'crypto%20signals'];

  const hashtagTerms = [];

  const selectedProfile = "Profile 2";
  logger.info(`Using Chrome profile: ${selectedProfile}`);
  let browser

  try {
    logger.info("Starting Chrome with profile...");
    browser = await setupBrowser();

    if (!browser) {
      logger.error("Failed to create Chrome browser");
      return;
    }

    const page = await browser.newPage();
    logger.info("Chrome started successfully");

    while (true) {
      const allResults = [];

      for (const search of searchTerms) {
        const results = await processSearchTerm(page, search, 200);
        if (results.length) {
          allResults.push({
            search,
            total_videos: results.length,
            videos: results,
          });
          console.log(
            `Successfully processed ${results.length} videos for '${search}'`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      console.log("\nAll search terms processed!");
      for (const hashtag of hashtagTerms) {
        const results = await processHashtagTerm(page, hashtag, 200);
        if (results.length) {
          allResults.push({
            search: "#" + hashtag,
            total_videos: results.length,
            videos: results,
          });
          console.log(
            `Successfully processed ${results.length} videos for '#${hashtag}'`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      if (allResults.length) {
        const savedPath = saveCombinedResults(allResults);
        if (savedPath) {
          console.log("\nSuccessfully saved all results!");
        }

        const tiktoksInputData = [];
        const mentionsInputData = [];
        const snapshot_timestamp = new Date();
        for (const search of allResults) {
          for (const video of search.videos) {
            const { thumbnail_url, video_url, views, posted_timestamp, posted_time, extracted_time, comments, hashtags, author } = video;
            const tiktok_id = video.video_url.split('/').pop();
            tiktoksInputData.push({
              id: tiktok_id,
              tiktok_id,
              url: video_url,
              thumbnail_url,
              creator: author,
              hashtags,
              createdAt: posted_time == '1s' ? new Date(0) : new Date(posted_timestamp * 1000),
              extracted_time: snapshot_timestamp,
              likes: views ? convertToNumber(views) : 0,
            });
            const mentions = normalizeObject(comments.mentions);
            for (const [mention, value] of Object.entries(mentions)) {
              const { count, isTicker } = value;
              mentionsInputData.push({
                mention: mention.startsWith('https://') ? mention.split('/').pop() : mention,
                tiktok_id,
                is_ticker: isTicker,
                count,
                snapshot_timestamp
              });
            }
          }
        }
        console.log(`Prepared ${tiktoksInputData.length} tiktok entries and ${mentionsInputData.length} mention entries.`);
        await upsertTiktoks(tiktoksInputData);
        console.log(mentionsInputData[0])
        await upsertMentionsInChunks(mentionsInputData);
        console.log('Data processing completed.');
        // await addTiktoks(supabase, {
        //   extraction_time: new Date().toISOString(),
        //   total_searches: allResults.length,
        //   results: allResults,
        // });
      }

      await new Promise((resolve) => setTimeout(resolve, 3600000)); // Wait for 1 hour

    }

  } catch (e) {
    logger.error(`Unexpected error: ${e}`);
  } finally {
    try {
      console.log(browser)
      if (browser) {
        console.log("Closing Browser")
        await browser.close();
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
};

main();
