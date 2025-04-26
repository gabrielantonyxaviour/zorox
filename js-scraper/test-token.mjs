import NodeCache from "node-cache";
import * as fs from "fs";
import * as path from "path";
import BigNumber from "bignumber.js";
import dotenv from "dotenv";

dotenv.config()

// Re-export BigNumber constructor
export const BN = BigNumber;
// Helper function to create new BigNumber instances
export function toBN(value) {
    return new BigNumber(value);
}

export function formatNumber(num) {
    if (num >= 1_000_000_000) {
        return `${(num / 1_000_000_000).toFixed(2)}b`; // Billion
    } else if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(2)}m`; // Million
    } else if (num >= 1_000) {
        return `${(num / 1_000).toFixed(2)}k`; // Thousand
    } else {
        return num.toString(); // Less than 1,000
    }
}

const PROVIDER_CONFIG = {
    BIRDEYE_API: "https://public-api.birdeye.so",
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000,
    DEFAULT_RPC: "https://api.mainnet-beta.solana.com",
    TOKEN_ADDRESSES: {
        "BQ6yqeqDinHtTUHH4JMzUAZ1MqGdNzcu9sDVcLrmpump": {
            name: "ZOROX",
            chain: "solana"
        },
        "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC": {
            name: "AI16Z",
            chain: "solana"
        },
        "So11111111111111111111111111111111111111112": {
            name: "SOL",
            chain: "solana"
        },
        "qfnqNqs3nCAHjnyCgLRDbBtq4p2MtHZxw8YjSyYhPoL": {
            name: "BTC",
            chain: "solana"
        },
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": {
            name: "ETH",
            chain: "ethereum"
        },
    },
    TOKEN_SECURITY_ENDPOINT: "/defi/token_security?address=",
    TOKEN_TRADE_DATA_ENDPOINT: "/defi/v3/token/trade-data/single?address=",
    DEX_SCREENER_API: "https://api.dexscreener.com/latest/dex/tokens/",
};


export class TokenProvider {
    constructor(tokenAddress, chain) {
        this.tokenAddress = tokenAddress;
        this.chain = chain;
        this.cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache
        const __dirname = path.resolve();
        this.cacheDir = path.join(__dirname, "cache");
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir);
        }
    }

    readCacheFromFile(cacheKey) {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);
        console.log({ filePath });
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(fileContent);
            const now = Date.now();
            if (now < parsed.expiry) {
                console.log(
                    `Reading cached data from file for key: ${cacheKey}`
                );
                return parsed.data;
            } else {
                console.log(
                    `Cache expired for key: ${cacheKey}. Deleting file.`
                );
                fs.unlinkSync(filePath);
            }
        }
        return null;
    }

    writeCacheToFile(cacheKey, data) {
        const filePath = path.join(this.cacheDir, `${cacheKey}.json`);
        const cacheData = {
            data: data,
            expiry: Date.now() + 300000, // 5 minutes in milliseconds
        };
        fs.writeFileSync(filePath, JSON.stringify(cacheData), "utf-8");
        console.log(`Cached data written to file for key: ${cacheKey}`);
    }

    getCachedData(cacheKey) {
        // Check in-memory cache first
        const cachedData = this.cache.get(cacheKey);
        if (cachedData) {
            return cachedData;
        }

        // Check file-based cache
        const fileCachedData = this.readCacheFromFile(cacheKey);
        if (fileCachedData) {
            // Populate in-memory cache
            this.cache.set(cacheKey, fileCachedData);
            return fileCachedData;
        }

        return null;
    }

    setCachedData(cacheKey, data) {
        // Set in-memory cache
        this.cache.set(cacheKey, data);

        // Write to file-based cache
        this.writeCacheToFile(cacheKey, data);
    }

    async fetchWithRetry(url, options = {}) {
        let lastError;

        for (let i = 0; i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
            try {
                const headers = {
                    "x-chain": this.chain,
                    Accept: "application/json",
                    "X-API-KEY": process.env.BIRDEYE_API_KEY || "",
                    ...options.headers
                };
                console.log(url)
                console.log(headers)
                const response = await fetch(url, {
                    ...options,
                    headers
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(
                        `HTTP error! status: ${response.status}, message: ${errorText}`
                    );
                }

                const data = await response.json();
                return data;
            } catch (error) {
                console.error(`Attempt ${i + 1} failed:`, error);
                lastError = error;
                if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
                    await new Promise((resolve) =>
                        setTimeout(resolve, PROVIDER_CONFIG.RETRY_DELAY * Math.pow(2, i))
                    );
                }
            }
        }

        throw lastError;
    }

    async fetchTokenSecurity() {
        const cacheKey = `tokenSecurity_${this.tokenAddress}`;
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log(
                `Returning cached token security data for ${this.tokenAddress}.`
            );
            return cachedData;
        }
        const url = `${PROVIDER_CONFIG.BIRDEYE_API}${PROVIDER_CONFIG.TOKEN_SECURITY_ENDPOINT}${this.tokenAddress}`;
        const data = await this.fetchWithRetry(url, {
            method: "GET",
            headers: {
                "x-chain": PROVIDER_CONFIG.TOKEN_ADDRESSES[this.tokenAddress].chain,
            },
        });

        if (!data?.success || !data?.data) {
            throw new Error("No token security data available");
        }

        const security = {
            ownerBalance: data.data.ownerBalance,
            creatorBalance: data.data.creatorBalance,
            ownerPercentage: data.data.ownerPercentage,
            creatorPercentage: data.data.creatorPercentage,
            top10HolderBalance: data.data.top10HolderBalance,
            top10HolderPercent: data.data.top10HolderPercent,
        };
        this.setCachedData(cacheKey, security);
        console.log(`Token security data cached for ${this.tokenAddress}.`);

        return security;
    }

    async fetchTokenTradeData() {
        const cacheKey = `tokenTradeData_${this.tokenAddress}`;
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log(
                `Returning cached token trade data for ${this.tokenAddress}.`
            );
            return cachedData;
        }

        const url = `${PROVIDER_CONFIG.BIRDEYE_API}${PROVIDER_CONFIG.TOKEN_TRADE_DATA_ENDPOINT}${this.tokenAddress}`;
        const options = {
            method: "GET",
            headers: {
                accept: "application/json",
                "X-API-KEY": process.env.BIRDEYE_API_KEY || "",
                'x-chain': PROVIDER_CONFIG.TOKEN_ADDRESSES[this.tokenAddress].chain,
            },
        };

        console.log(url)
        console.log(options)
        const data = await fetch(url, options)
            .then((res) => res.json())
            .catch((err) => console.error(err));

        if (!data?.success || !data?.data) {
            throw new Error("No token trade data available");
        }

        const tradeData = {
            address: data.data.address,
            holder: data.data.holder,
            market: data.data.market,
            last_trade_unix_time: data.data.last_trade_unix_time,
            last_trade_human_time: data.data.last_trade_human_time,
            price: data.data.price,
            history_30m_price: data.data.history_30m_price,
            price_change_30m_percent: data.data.price_change_30m_percent,
            history_1h_price: data.data.history_1h_price,
            price_change_1h_percent: data.data.price_change_1h_percent,
            history_2h_price: data.data.history_2h_price,
            price_change_2h_percent: data.data.price_change_2h_percent,
            history_4h_price: data.data.history_4h_price,
            price_change_4h_percent: data.data.price_change_4h_percent,
            history_6h_price: data.data.history_6h_price,
            price_change_6h_percent: data.data.price_change_6h_percent,
            history_8h_price: data.data.history_8h_price,
            price_change_8h_percent: data.data.price_change_8h_percent,
            history_12h_price: data.data.history_12h_price,
            price_change_12h_percent: data.data.price_change_12h_percent,
            history_24h_price: data.data.history_24h_price,
            price_change_24h_percent: data.data.price_change_24h_percent,
            unique_wallet_30m: data.data.unique_wallet_30m,
            unique_wallet_history_30m: data.data.unique_wallet_history_30m,
            unique_wallet_30m_change_percent:
                data.data.unique_wallet_30m_change_percent,
            unique_wallet_1h: data.data.unique_wallet_1h,
            unique_wallet_history_1h: data.data.unique_wallet_history_1h,
            unique_wallet_1h_change_percent:
                data.data.unique_wallet_1h_change_percent,
            unique_wallet_2h: data.data.unique_wallet_2h,
            unique_wallet_history_2h: data.data.unique_wallet_history_2h,
            unique_wallet_2h_change_percent:
                data.data.unique_wallet_2h_change_percent,
            unique_wallet_4h: data.data.unique_wallet_4h,
            unique_wallet_history_4h: data.data.unique_wallet_history_4h,
            unique_wallet_4h_change_percent:
                data.data.unique_wallet_4h_change_percent,
            unique_wallet_8h: data.data.unique_wallet_8h,
            unique_wallet_history_8h: data.data.unique_wallet_history_8h,
            unique_wallet_8h_change_percent:
                data.data.unique_wallet_8h_change_percent,
            unique_wallet_24h: data.data.unique_wallet_24h,
            unique_wallet_history_24h: data.data.unique_wallet_history_24h,
            unique_wallet_24h_change_percent:
                data.data.unique_wallet_24h_change_percent,
            trade_30m: data.data.trade_30m,
            trade_history_30m: data.data.trade_history_30m,
            trade_30m_change_percent: data.data.trade_30m_change_percent,
            sell_30m: data.data.sell_30m,
            sell_history_30m: data.data.sell_history_30m,
            sell_30m_change_percent: data.data.sell_30m_change_percent,
            buy_30m: data.data.buy_30m,
            buy_history_30m: data.data.buy_history_30m,
            buy_30m_change_percent: data.data.buy_30m_change_percent,
            volume_30m: data.data.volume_30m,
            volume_30m_usd: data.data.volume_30m_usd,
            volume_history_30m: data.data.volume_history_30m,
            volume_history_30m_usd: data.data.volume_history_30m_usd,
            volume_30m_change_percent: data.data.volume_30m_change_percent,
            volume_buy_30m: data.data.volume_buy_30m,
            volume_buy_30m_usd: data.data.volume_buy_30m_usd,
            volume_buy_history_30m: data.data.volume_buy_history_30m,
            volume_buy_history_30m_usd: data.data.volume_buy_history_30m_usd,
            volume_buy_30m_change_percent:
                data.data.volume_buy_30m_change_percent,
            volume_sell_30m: data.data.volume_sell_30m,
            volume_sell_30m_usd: data.data.volume_sell_30m_usd,
            volume_sell_history_30m: data.data.volume_sell_history_30m,
            volume_sell_history_30m_usd: data.data.volume_sell_history_30m_usd,
            volume_sell_30m_change_percent:
                data.data.volume_sell_30m_change_percent,
            trade_1h: data.data.trade_1h,
            trade_history_1h: data.data.trade_history_1h,
            trade_1h_change_percent: data.data.trade_1h_change_percent,
            sell_1h: data.data.sell_1h,
            sell_history_1h: data.data.sell_history_1h,
            sell_1h_change_percent: data.data.sell_1h_change_percent,
            buy_1h: data.data.buy_1h,
            buy_history_1h: data.data.buy_history_1h,
            buy_1h_change_percent: data.data.buy_1h_change_percent,
            volume_1h: data.data.volume_1h,
            volume_1h_usd: data.data.volume_1h_usd,
            volume_history_1h: data.data.volume_history_1h,
            volume_history_1h_usd: data.data.volume_history_1h_usd,
            volume_1h_change_percent: data.data.volume_1h_change_percent,
            volume_buy_1h: data.data.volume_buy_1h,
            volume_buy_1h_usd: data.data.volume_buy_1h_usd,
            volume_buy_history_1h: data.data.volume_buy_history_1h,
            volume_buy_history_1h_usd: data.data.volume_buy_history_1h_usd,
            volume_buy_1h_change_percent:
                data.data.volume_buy_1h_change_percent,
            volume_sell_1h: data.data.volume_sell_1h,
            volume_sell_1h_usd: data.data.volume_sell_1h_usd,
            volume_sell_history_1h: data.data.volume_sell_history_1h,
            volume_sell_history_1h_usd: data.data.volume_sell_history_1h_usd,
            volume_sell_1h_change_percent:
                data.data.volume_sell_1h_change_percent,
            trade_2h: data.data.trade_2h,
            trade_history_2h: data.data.trade_history_2h,
            trade_2h_change_percent: data.data.trade_2h_change_percent,
            sell_2h: data.data.sell_2h,
            sell_history_2h: data.data.sell_history_2h,
            sell_2h_change_percent: data.data.sell_2h_change_percent,
            buy_2h: data.data.buy_2h,
            buy_history_2h: data.data.buy_history_2h,
            buy_2h_change_percent: data.data.buy_2h_change_percent,
            volume_2h: data.data.volume_2h,
            volume_2h_usd: data.data.volume_2h_usd,
            volume_history_2h: data.data.volume_history_2h,
            volume_history_2h_usd: data.data.volume_history_2h_usd,
            volume_2h_change_percent: data.data.volume_2h_change_percent,
            volume_buy_2h: data.data.volume_buy_2h,
            volume_buy_2h_usd: data.data.volume_buy_2h_usd,
            volume_buy_history_2h: data.data.volume_buy_history_2h,
            volume_buy_history_2h_usd: data.data.volume_buy_history_2h_usd,
            volume_buy_2h_change_percent:
                data.data.volume_buy_2h_change_percent,
            volume_sell_2h: data.data.volume_sell_2h,
            volume_sell_2h_usd: data.data.volume_sell_2h_usd,
            volume_sell_history_2h: data.data.volume_sell_history_2h,
            volume_sell_history_2h_usd: data.data.volume_sell_history_2h_usd,
            volume_sell_2h_change_percent:
                data.data.volume_sell_2h_change_percent,
            trade_4h: data.data.trade_4h,
            trade_history_4h: data.data.trade_history_4h,
            trade_4h_change_percent: data.data.trade_4h_change_percent,
            sell_4h: data.data.sell_4h,
            sell_history_4h: data.data.sell_history_4h,
            sell_4h_change_percent: data.data.sell_4h_change_percent,
            buy_4h: data.data.buy_4h,
            buy_history_4h: data.data.buy_history_4h,
            buy_4h_change_percent: data.data.buy_4h_change_percent,
            volume_4h: data.data.volume_4h,
            volume_4h_usd: data.data.volume_4h_usd,
            volume_history_4h: data.data.volume_history_4h,
            volume_history_4h_usd: data.data.volume_history_4h_usd,
            volume_4h_change_percent: data.data.volume_4h_change_percent,
            volume_buy_4h: data.data.volume_buy_4h,
            volume_buy_4h_usd: data.data.volume_buy_4h_usd,
            volume_buy_history_4h: data.data.volume_buy_history_4h,
            volume_buy_history_4h_usd: data.data.volume_buy_history_4h_usd,
            volume_buy_4h_change_percent:
                data.data.volume_buy_4h_change_percent,
            volume_sell_4h: data.data.volume_sell_4h,
            volume_sell_4h_usd: data.data.volume_sell_4h_usd,
            volume_sell_history_4h: data.data.volume_sell_history_4h,
            volume_sell_history_4h_usd: data.data.volume_sell_history_4h_usd,
            volume_sell_4h_change_percent:
                data.data.volume_sell_4h_change_percent,
            trade_8h: data.data.trade_8h,
            trade_history_8h: data.data.trade_history_8h,
            trade_8h_change_percent: data.data.trade_8h_change_percent,
            sell_8h: data.data.sell_8h,
            sell_history_8h: data.data.sell_history_8h,
            sell_8h_change_percent: data.data.sell_8h_change_percent,
            buy_8h: data.data.buy_8h,
            buy_history_8h: data.data.buy_history_8h,
            buy_8h_change_percent: data.data.buy_8h_change_percent,
            volume_8h: data.data.volume_8h,
            volume_8h_usd: data.data.volume_8h_usd,
            volume_history_8h: data.data.volume_history_8h,
            volume_history_8h_usd: data.data.volume_history_8h_usd,
            volume_8h_change_percent: data.data.volume_8h_change_percent,
            volume_buy_8h: data.data.volume_buy_8h,
            volume_buy_8h_usd: data.data.volume_buy_8h_usd,
            volume_buy_history_8h: data.data.volume_buy_history_8h,
            volume_buy_history_8h_usd: data.data.volume_buy_history_8h_usd,
            volume_buy_8h_change_percent:
                data.data.volume_buy_8h_change_percent,
            volume_sell_8h: data.data.volume_sell_8h,
            volume_sell_8h_usd: data.data.volume_sell_8h_usd,
            volume_sell_history_8h: data.data.volume_sell_history_8h,
            volume_sell_history_8h_usd: data.data.volume_sell_history_8h_usd,
            volume_sell_8h_change_percent:
                data.data.volume_sell_8h_change_percent,
            trade_24h: data.data.trade_24h,
            trade_history_24h: data.data.trade_history_24h,
            trade_24h_change_percent: data.data.trade_24h_change_percent,
            sell_24h: data.data.sell_24h,
            sell_history_24h: data.data.sell_history_24h,
            sell_24h_change_percent: data.data.sell_24h_change_percent,
            buy_24h: data.data.buy_24h,
            buy_history_24h: data.data.buy_history_24h,
            buy_24h_change_percent: data.data.buy_24h_change_percent,
            volume_24h: data.data.volume_24h,
            volume_24h_usd: data.data.volume_24h_usd,
            volume_history_24h: data.data.volume_history_24h,
            volume_history_24h_usd: data.data.volume_history_24h_usd,
            volume_24h_change_percent: data.data.volume_24h_change_percent,
            volume_buy_24h: data.data.volume_buy_24h,
            volume_buy_24h_usd: data.data.volume_buy_24h_usd,
            volume_buy_history_24h: data.data.volume_buy_history_24h,
            volume_buy_history_24h_usd: data.data.volume_buy_history_24h_usd,
            volume_buy_24h_change_percent:
                data.data.volume_buy_24h_change_percent,
            volume_sell_24h: data.data.volume_sell_24h,
            volume_sell_24h_usd: data.data.volume_sell_24h_usd,
            volume_sell_history_24h: data.data.volume_sell_history_24h,
            volume_sell_history_24h_usd: data.data.volume_sell_history_24h_usd,
            volume_sell_24h_change_percent:
                data.data.volume_sell_24h_change_percent,
        };
        this.setCachedData(cacheKey, tradeData);
        return tradeData;
    }

    async fetchDexScreenerData() {
        const cacheKey = `dexScreenerData_${this.tokenAddress}`;
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log("Returning cached DexScreener data.");
            return cachedData;
        }

        const url = `https://api.dexscreener.com/latest/dex/search?q=${this.tokenAddress}`;
        try {
            console.log(
                `Fetching DexScreener data for token: ${this.tokenAddress}`
            );
            const data = await fetch(url)
                .then((res) => res.json())
                .catch((err) => {
                    console.error(err);
                });

            if (!data || !data.pairs) {
                throw new Error("No DexScreener data available");
            }

            const dexData = {
                schemaVersion: data.schemaVersion,
                pairs: data.pairs,
            };

            // Cache the result
            this.setCachedData(cacheKey, dexData);

            return dexData;
        } catch (error) {
            console.error(`Error fetching DexScreener data:`, error);
            return {
                schemaVersion: "1.0.0",
                pairs: [],
            };
        }
    }

    async analyzeHolderDistribution(
        tradeData
    ) {
        // Define the time intervals to consider (e.g., 30m, 1h, 2h)
        const intervals = [
            {
                period: "30m",
                change: tradeData.unique_wallet_30m_change_percent,
            },
            { period: "1h", change: tradeData.unique_wallet_1h_change_percent },
            { period: "2h", change: tradeData.unique_wallet_2h_change_percent },
            { period: "4h", change: tradeData.unique_wallet_4h_change_percent },
            { period: "8h", change: tradeData.unique_wallet_8h_change_percent },
            {
                period: "24h",
                change: tradeData.unique_wallet_24h_change_percent,
            },
        ];

        // Calculate the average change percentage
        const validChanges = intervals
            .map((interval) => interval.change)
            .filter(
                (change) => change !== null && change !== undefined
            )

        if (validChanges.length === 0) {
            return "stable";
        }

        const averageChange =
            validChanges.reduce((acc, curr) => acc + curr, 0) /
            validChanges.length;

        const increaseThreshold = 10; // e.g., average change > 10%
        const decreaseThreshold = -10; // e.g., average change < -10%

        if (averageChange > increaseThreshold) {
            return "increasing";
        } else if (averageChange < decreaseThreshold) {
            return "decreasing";
        } else {
            return "stable";
        }
    }

    async fetchHolderList() {
        const cacheKey = `holderList_${this.tokenAddress}`;
        const cachedData = this.getCachedData(cacheKey);
        if (cachedData) {
            console.log("Returning cached holder list.");
            return cachedData;
        }

        const allHoldersMap = new Map();
        let page = 1;
        const limit = 1000;
        let cursor;
        //HELIOUS_API_KEY needs to be added
        const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIOUS_API_KEY || ""}`;
        console.log({ url });

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const params = {
                    limit: limit,
                    displayOptions: {},
                    mint: this.tokenAddress,
                    cursor: cursor,
                };
                if (cursor != undefined) {
                    params.cursor = cursor;
                }
                console.log(`Fetching holders - Page ${page}`);
                if (page > 2) {
                    break;
                }
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: "helius-test",
                        method: "getTokenAccounts",
                        params: params,
                    }),
                });

                const data = await response.json();

                if (
                    !data ||
                    !data.result ||
                    !data.result.token_accounts ||
                    data.result.token_accounts.length === 0
                ) {
                    console.log(
                        `No more holders found. Total pages fetched: ${page - 1}`
                    );
                    break;
                }

                console.log(
                    `Processing ${data.result.token_accounts.length} holders from page ${page}`
                );

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.result.token_accounts.forEach((account) => {
                    const owner = account.owner;
                    const balance = parseFloat(account.amount);

                    if (allHoldersMap.has(owner)) {
                        allHoldersMap.set(
                            owner,
                            allHoldersMap.get(owner) + balance
                        );
                    } else {
                        allHoldersMap.set(owner, balance);
                    }
                });
                cursor = data.result.cursor;
                page++;
            }

            const holders = Array.from(
                allHoldersMap.entries()
            ).map(([address, balance]) => ({
                address,
                balance: balance.toString(),
            }));

            console.log(`Total unique holders fetched: ${holders.length}`);

            // Cache the result
            this.setCachedData(cacheKey, holders);

            return holders;
        } catch (error) {
            console.error("Error fetching holder list from Helius:", error);
            throw new Error("Failed to fetch holder list from Helius.");
        }
    }

    async filterHighValueHolders(
        tradeData
    ) {
        const holdersData = await this.fetchHolderList();

        const tokenPriceUsd = toBN(tradeData.price);

        const highValueHolders = holdersData
            .filter((holder) => {
                const balanceUsd = toBN(holder.balance).multipliedBy(
                    tokenPriceUsd
                );
                return balanceUsd.isGreaterThan(5);
            })
            .map((holder) => ({
                holderAddress: holder.address,
                balanceUsd: toBN(holder.balance)
                    .multipliedBy(tokenPriceUsd)
                    .toFixed(2),
            }));

        return highValueHolders;
    }

    async checkRecentTrades(tradeData) {
        return toBN(tradeData.volume_24h_usd).isGreaterThan(0);
    }

    async countHighSupplyHolders(
        securityData
    ) {
        try {
            const ownerBalance = toBN(securityData.ownerBalance);
            const totalSupply = ownerBalance.plus(securityData.creatorBalance);

            const highSupplyHolders = await this.fetchHolderList();
            const highSupplyHoldersCount = highSupplyHolders.filter(
                (holder) => {
                    const balance = toBN(holder.balance);
                    return balance.dividedBy(totalSupply).isGreaterThan(0.02);
                }
            ).length;
            return highSupplyHoldersCount;
        } catch (error) {
            console.error("Error counting high supply holders:", error);
            return 0;
        }
    }

    async getProcessedTokenData() {
        try {
            console.log(
                `Fetching security data for token: ${this.tokenAddress}`
            );
            const security = await this.fetchTokenSecurity();

            console.log(`Fetching trade data for token: ${this.tokenAddress}`);
            const tradeData = await this.fetchTokenTradeData();

            console.log(
                `Fetching DexScreener data for token: ${this.tokenAddress}`
            );
            const dexData = await this.fetchDexScreenerData();

            console.log(
                `Analyzing holder distribution for token: ${this.tokenAddress}`
            );
            const holderDistributionTrend =
                await this.analyzeHolderDistribution(tradeData);

            console.log(
                `Filtering high-value holders for token: ${this.tokenAddress}`
            );
            const highValueHolders =
                await this.filterHighValueHolders(tradeData);

            console.log(
                `Checking recent trades for token: ${this.tokenAddress}`
            );
            const recentTrades = await this.checkRecentTrades(tradeData);

            console.log(
                `Counting high-supply holders for token: ${this.tokenAddress}`
            );
            const highSupplyHoldersCount =
                await this.countHighSupplyHolders(security);

            console.log(
                `Determining DexScreener listing status for token: ${this.tokenAddress}`
            );
            const isDexScreenerListed = dexData.pairs.length > 0;
            const isDexScreenerPaid = dexData.pairs.some(
                (pair) => pair.boosts && pair.boosts.active > 0
            );

            const processedData = {
                security,
                tradeData,
                holderDistributionTrend,
                highValueHolders,
                recentTrades,
                highSupplyHoldersCount,
                // priceData,
                dexScreenerData: dexData,
                isDexScreenerListed,
                isDexScreenerPaid,
            };

            // console.log("Processed token data:", processedData);
            return processedData;
        } catch (error) {
            console.error("Error processing token data:", error);
            throw error;
        }
    }

    formatTokenData(data) {
        let output = `**Token Security and Trade Report**\n`;
        output += `Token Address: ${this.tokenAddress}\n\n`;

        // Security Data
        output += `**Ownership Distribution:**\n`;
        output += `- Owner Balance: ${data.security.ownerBalance}\n`;
        output += `- Creator Balance: ${data.security.creatorBalance}\n`;
        output += `- Owner Percentage: ${data.security.ownerPercentage}%\n`;
        output += `- Creator Percentage: ${data.security.creatorPercentage}%\n`;
        output += `- Top 10 Holders Balance: ${data.security.top10HolderBalance}\n`;
        output += `- Top 10 Holders Percentage: ${data.security.top10HolderPercent}%\n\n`;

        // Trade Data
        output += `**Trade Data:**\n`;
        output += `- Holders: ${data.tradeData.holder}\n`;
        output += `- Unique Wallets (24h): ${data.tradeData.unique_wallet_24h}\n`;
        output += `- Price Change (24h): ${data.tradeData.price_change_24h_percent}%\n`;
        output += `- Price Change (12h): ${data.tradeData.price_change_12h_percent}%\n`;
        output += `- Volume (24h USD): $${toBN(data.tradeData.volume_24h_usd).toFixed(2)}\n`;
        output += `- Current Price: $${toBN(data.tradeData.price).toFixed(2)}\n\n`;

        // Holder Distribution Trend
        output += `**Holder Distribution Trend:** ${data.holderDistributionTrend}\n\n`;

        // High-Value Holders
        output += `**High-Value Holders (>$5 USD):**\n`;
        if (data.highValueHolders.length === 0) {
            output += `- No high-value holders found or data not available.\n`;
        } else {
            data.highValueHolders.forEach((holder) => {
                output += `- ${holder.holderAddress}: $${holder.balanceUsd}\n`;
            });
        }
        output += `\n`;

        // Recent Trades
        output += `**Recent Trades (Last 24h):** ${data.recentTrades ? "Yes" : "No"}\n\n`;

        // High-Supply Holders
        output += `**Holders with >2% Supply:** ${data.highSupplyHoldersCount}\n\n`;

        // DexScreener Status
        output += `**DexScreener Listing:** ${data.isDexScreenerListed ? "Yes" : "No"}\n`;
        if (data.isDexScreenerListed) {
            output += `- Listing Type: ${data.isDexScreenerPaid ? "Paid" : "Free"}\n`;
            output += `- Number of DexPairs: ${data.dexScreenerData.pairs.length}\n\n`;
            output += `**DexScreener Pairs:**\n`;
            data.dexScreenerData.pairs.forEach((pair, index) => {
                output += `\n**Pair ${index + 1}:**\n`;
                output += `- DEX: ${pair.dexId}\n`;
                output += `- URL: ${pair.url}\n`;
                output += `- Price USD: $${toBN(pair.priceUsd).toFixed(6)}\n`;
                output += `- Volume (24h USD): $${toBN(pair.volume.h24).toFixed(2)}\n`;
                output += `- Boosts Active: ${pair.boosts && pair.boosts.active}\n`;
                output += `- Liquidity USD: $${toBN(pair.liquidity.usd).toFixed(2)}\n`;
            });
        }
        output += `\n`;

        console.log("Formatted token data:", output);
        return output;
    }

    formatAltTokenData(data) {
        let output = `**Token Price Data in the last 24 hours**\n`;
        output += `Token Address: ${this.tokenAddress}\n\n`;

        data.priceData.prices.forEach((price) => {
            output += `- At ${new Date(price.timestamp * 1000).toLocaleString(
                "en-US",
                {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                }
            )} ${price.value}\n`;
        });
        // DexScreener Status
        output += `**DexScreener Listing:** ${data.isDexScreenerListed ? "Yes" : "No"}\n`;
        if (data.isDexScreenerListed) {
            output += `- Listing Type: ${data.isDexScreenerPaid ? "Paid" : "Free"}\n`;
            output += `- Number of DexPairs: ${data.dexScreenerData.pairs.length}\n\n`;
            output += `**DexScreener Pairs:**\n`;
            data.dexScreenerData.pairs.forEach((pair, index) => {
                output += `\n**Pair ${index + 1}:**\n`;
                output += `- DEX: ${pair.dexId}\n`;
                output += `- URL: ${pair.url}\n`;
                output += `- Price USD: $${toBN(pair.priceUsd).toFixed(6)}\n`;
                output += `- Volume (24h USD): $${toBN(pair.volume.h24).toFixed(2)}\n`;
                output += `- Boosts Active: ${pair.boosts && pair.boosts.active}\n`;
                output += `- Liquidity USD: $${toBN(pair.liquidity.usd).toFixed(2)}\n`;
            });
        }
        output += `\n`;

        console.log("Formatted token data:", output);
        return output;
    }
    async getFormattedTokenReport() {
        try {
            console.log("Generating formatted token report...");
            const processedData = await this.getProcessedTokenData();
            return this.formatTokenData(processedData);
        } catch (error) {
            console.error("Error generating token report:", error);
            return "Unable to fetch token information. Please try again later.";
        }
    }

    static async getAllTokenReports() {
        const tokenReports = [];

        for (const tokenAddress of Object.keys(PROVIDER_CONFIG.TOKEN_ADDRESSES)) {
            const tokenConfig = PROVIDER_CONFIG.TOKEN_ADDRESSES[tokenAddress];
            console.log(`Processing ${tokenConfig.symbol}...`);

            try {
                const provider = new TokenProvider(tokenAddress, tokenConfig.chain);
                const report = await provider.getFormattedTokenReport();
                tokenReports.push(`\n=== ${tokenConfig.symbol} Report ===\n${report}`);
            } catch (error) {
                console.error(`Error processing ${tokenConfig.symbol}:`, error);
                tokenReports.push(`\n=== ${tokenConfig.symbol} Report ===\nError fetching data for ${tokenConfig.symbol}`);
            }
        }

        return tokenReports.join('\n\n');
    }
}

(
    async function (

    ) {
        try {
            return TokenProvider.getAllTokenReports();
        } catch (error) {
            console.error("Error fetching token data:", error);
            return "Unable to fetch token information. Please try again later.";
        }
    }


)()