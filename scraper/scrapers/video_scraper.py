from datetime import datetime, timedelta
from selenium.webdriver.common.by import By
from utils.time_parser import parse_tiktok_time
from scrapers.comment_scraper import extract_comments

class VideoScraper:
    @staticmethod
    def extract_video_data(video_element):
        """Extract data from a TikTok video element"""
        try:
            data = {}
            
            # Extract posted time
            time_data = VideoScraper._extract_posted_time(video_element)
            if not time_data:
                print('Video older than 24 hours. Skipping...')
                return None
            data.update(time_data)
            
            # Extract other video data
            data.update(VideoScraper._extract_video_url(video_element))
            data.update(VideoScraper._extract_thumbnail(video_element))
            data.update(VideoScraper._extract_description(video_element))
            data.update(VideoScraper._extract_hashtags(video_element))
            data.update(VideoScraper._extract_author(video_element))
            data.update(VideoScraper._extract_views(video_element))
            
            # Extract comments if video URL is available
            if 'video_url' in data:
                print(f"Extracting comments for video: {data['video_url']}")
                post_id = data['video_url'].split('/')[-1]
                data['comments'] = extract_comments(post_id)
                print(f"Found {len(data['comments'])} comments")
            
            data['extracted_time'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            
            return data
            
        except Exception as e:
            print(f"Error extracting video data: {e}")
            return None

    @staticmethod
    def _extract_posted_time(video_element):
        """Extract and validate posted time"""
        try:
            time_selectors = [
                "div.css-dennn6-DivTimeTag",
                "div[class*='TimeTag']"
            ]
            
            posted_time = ""
            posted_datetime = datetime.min
            
            for selector in time_selectors:
                try:
                    time_element = video_element.find_element(By.CSS_SELECTOR, selector)
                    posted_time = time_element.text.strip()
                    if posted_time:
                        posted_datetime = parse_tiktok_time(posted_time)
                        break
                except:
                    continue
                    
            now = datetime.now()
            if now - timedelta(hours=24) <= posted_datetime <= now:
                return {
                    'posted_time': posted_time,
                    'posted_timestamp': posted_datetime.timestamp()
                }
            return None
            
        except Exception as e:
            print(f"Error getting posted time: {e}")
            return None

    @staticmethod
    def _extract_video_url(video_element):
        """Extract video URL"""
        try:
            link_selectors = [
                "a.css-1g95xhm-AVideoContainer",
                "a[href*='/video/']",
                "a[class*='AVideoContainer']"
            ]
            for selector in link_selectors:
                try:
                    link = video_element.find_element(By.CSS_SELECTOR, selector)
                    url = link.get_attribute("href")
                    if url and '/video/' in url:
                        return {'video_url': url}
                except:
                    continue
        except Exception as e:
            print(f"Error getting video URL: {e}")
        return {'video_url': ""}
    
    @staticmethod
    def _extract_thumbnail(video_element):
        """Extract video thumbnail"""
        try:
            thumbnail_selectors = [
                "img.css-1dbjc4n",
                "img[src*='webp']"
            ]
            for selector in thumbnail_selectors:
                try:
                    thumbnail = video_element.find_element(By.CSS_SELECTOR, selector)
                    url = thumbnail.get_attribute("src")
                    if url and '.webp' in url:
                        return {'thumbnail': url}
                except:
                    continue
        except Exception as e:
            print(f"Error getting thumbnail: {e}")
        return {'thumbnail': ""}
    
    @staticmethod
    def _extract_description(video_element):
        """Extract video description"""
        try:
            description_selectors = [
                "div.css-1dbjc4n",
                "div[class*='Description']"
            ]
            for selector in description_selectors:
                try:
                    description_element = video_element.find_element(By.CSS_SELECTOR, selector)
                    description = description_element.text.strip()
                    if description:
                        return {'description': description}
                except:
                    continue
        except Exception as e:
            print(f"Error getting description: {e}")
        return {'description': ""}
    
    @staticmethod
    def _extract_hashtags(video_element):
        """Extract video hashtags"""
        try:
            hashtags_selectors = [
                "a.css-4rbku5-A",
                "a[href*='/tag/']"
            ]
            hashtags = []
            for selector in hashtags_selectors:
                try:
                    hashtag_elements = video_element.find_elements(By.CSS_SELECTOR, selector)
                    for element in hashtag_elements:
                        hashtag = element.text.strip()
                        if hashtag and hashtag.startswith('#'):
                            hashtags.append(hashtag)
                except:
                    continue
            return {'hashtags': hashtags}
        except Exception as e:
            print(f"Error getting hashtags: {e}")
        return {'hashtags': []}
    
    @staticmethod
    def _extract_author(video_element):
        """Extract video author"""
        try:
            author_selectors = [
                "a.css-4rbku5-A",
                "a[href*='/user/']"
            ]
            for selector in author_selectors:
                try:
                    author_element = video_element.find_element(By.CSS_SELECTOR, selector)
                    author = author_element.text.strip()
                    if author:
                        return {'author': author}
                except:
                    continue
        except Exception as e:
            print(f"Error getting author: {e}")
        return {'author': ""}
    
    @staticmethod
    def _extract_views(video_element):
        """Extract video views"""
        try:
            views_selectors = [
                "div.css-1dbjc4n",
                "div[class*='Views']"
            ]
            for selector in views_selectors:
                try:
                    views_element = video_element.find_element(By.CSS_SELECTOR, selector)
                    views = views_element.text.strip()
                    if views:
                        return {'views': views}
                except:
                    continue
        except Exception as e:
            print(f"Error getting views: {e}")
        return {'views': ""}
    