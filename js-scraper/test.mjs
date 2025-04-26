import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv"
dotenv.config()


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function fetchTickerAddress(keyword) {
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-KEY': process.env.BIRDEYE_API_KEY || ''
    }
  };

  const url = `https://public-api.birdeye.so/defi/v3/search?keyword=${encodeURIComponent(keyword)}&target=token&sort_by=price&sort_type=desc&offset=0&limit=20`;

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!data.success || !data.data?.items?.[0]?.result || data.data.items[0].result.length == 0) {
      return null;
    }

    let i = 0
    while (i < data.data.items[0].result.length) {
      if (data.data.items[0].result[i].symbol == keyword) return { address: data.data.items[0].result[i].address, chain: data.data.items[0].result[i].network }
      i++
    }
    return null
  } catch (error) {
    console.error('Error fetching token data:', error);
    return null;
  }
}

const formatTokensForAI = (tokens) => {
  if (!tokens?.length) return "No token data available";

  return tokens.map(token =>
    `Token: ${token.name} (${token.symbol})
    Address: ${token.address}
    Price: $${token.keyMetrics.price.toFixed(6)}
    Market Cap: $${token.keyMetrics.marketCap.toLocaleString()}
    24h Trades: ${token.keyMetrics.dailyTrades}
    24h Volume: $${token.keyMetrics.dailyVolumeUSD.toLocaleString()}
    Holders: ${token.keyMetrics.holders}
    Hours Since Last Trade: ${token.keyMetrics.hoursSinceLastTrade}
    Liquidity: $${token.keyMetrics.liquidity.toLocaleString()}`
  ).join('\n\n');
};

const getTrendingMentions = async () => {
  try {
    const { data, error } = await supabase
      .rpc('get_trending_mentions');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting trending mentions:', error);
    throw error;
  }
};

const getAggregatedMentions = async () => {
  try {
    const { data, error } = await supabase
      .rpc('get_aggregated_mentions');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting trending mentions:', error);
    throw error;
  }
};


// Usage
// fetchAndFormatTokenData('BOTIFY', process.env.BIRDEYE_API_KEY || '')
//   .then(tokens => {
//     const formattedData = formatTokensForAI(tokens);
//     console.log(formattedData);
//     // Now formattedData can be used as input for AI prompt
//   })
//   .catch(console.error);


async function fetchTokenData(token) {
  const options = {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
      'x-chain': token.chain
    }
  };
  await new Promise(resolve => setTimeout(resolve, 500));
  const url = `https://public-api.birdeye.so/defi/token_overview?address=${token.address}`;

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!data.success || !data.data) {
      return null;
    }
    return analyzeTokenHealth(data.data);

  } catch (error) {
    return null;
  }
}

function analyzeTokenHealth(tokenData) {
  const {
    trade24h,
    v24hUSD,
    holder,
    lastTradeUnixTime,
    liquidity,
    price,
    mc,
    numberMarkets
  } = tokenData;

  const currentTime = Math.floor(Date.now() / 1000);
  const hoursSinceLastTrade = (currentTime - lastTradeUnixTime) / 3600;

  const DEAD_CRITERIA = {
    MIN_24H_TRADES: 10,
    MIN_24H_VOLUME_USD: 100, // $100 minimum daily volume
    MIN_HOLDERS: 5,
    MAX_HOURS_NO_TRADE: 24,
    MIN_LIQUIDITY: 1000, // $1000 minimum liquidity
    MIN_MARKET_CAP: 10000, // $10,000 minimum market cap
    MIN_MARKETS: 1
  };

  // Calculate individual death factors
  const deathFactors = {
    noRecentTrades: trade24h <= DEAD_CRITERIA.MIN_24H_TRADES,
    lowVolume: v24hUSD <= DEAD_CRITERIA.MIN_24H_VOLUME_USD,
    fewHolders: holder <= DEAD_CRITERIA.MIN_HOLDERS,
    tradingInactive: hoursSinceLastTrade >= DEAD_CRITERIA.MAX_HOURS_NO_TRADE,
    noLiquidity: liquidity <= DEAD_CRITERIA.MIN_LIQUIDITY,
    tinyMarketCap: mc <= DEAD_CRITERIA.MIN_MARKET_CAP,
    limitedMarkets: numberMarkets < DEAD_CRITERIA.MIN_MARKETS
  };

  // Token is considered dead if it meets multiple death criteria
  const deathScore = Object.values(deathFactors).filter(Boolean).length;
  const isDead = deathScore >= 3; // Token is dead if it meets 3 or more death criteria

  return {
    name: tokenData.name,
    symbol: tokenData.symbol,
    address: tokenData.address,
    isDead,
    deathScore,
    keyMetrics: {
      price,
      marketCap: mc,
      dailyTrades: trade24h,
      dailyVolumeUSD: v24hUSD,
      holders: holder,
      hoursSinceLastTrade: Math.round(hoursSinceLastTrade),
      liquidity,
      numberMarkets
    },
    deathFactors
  };
}



async function main() {
  // Fetch dead filtered latest mentions from supabase.

  // const mentions = await getTrendingMentions();
  const mentions = await getAggregatedMentions();
  console.log(mentions)
  // const tokens = await Promise.all(
  //   mentions.map(async mention => {
  //     const token = await fetchTickerAddress(mention.mention);
  //     if (token === null) {
  //       return null;
  //     }
  //     await new Promise(resolve => setTimeout(resolve, 1000));
  //     const tokenData = await fetchTokenData(token);
  //     if (tokenData === null) {
  //       return null;
  //     }
  //     await new Promise(resolve => setTimeout(resolve, 1000));
  //     return tokenData;
  //   })
  // ).then(results => results.filter(result => result !== null));


  // console.log(tokens)
  // const nonDeadTokens = tokens.filter(token => !token.isDead);

  // if (nonDeadTokens.length == 0) {
  //   console.log("No Trending Tickers in Tiktok at the moment.")
  // } else {
  //   const data = formatTokensForAI(nonDeadTokens)
  //   console.log(data)
  // }
  // const postedAt = new Date()
  // const pushData = tokens.map(token => {
  //   return {
  //     name: token.symbol,
  //     posted_at: token.isDead ? new Date(0) : postedAt,
  //     is_dead: token.isDead,
  //   }
  // })

  // const { error } = await supabase
  //   .from('tickers')
  //   .upsert(pushData).select()

  // if (error) {
  //   console.error('Error upserting data into Supabase:', error);
  // } else {
  //   console.log('Data successfully upserted into Supabase');
  // }

}

main()
