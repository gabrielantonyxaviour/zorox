import axios from "axios";
import dotenv from "dotenv";
import * as fs from "fs";

dotenv.config();

const data = JSON.stringify({
  query: `{
    Solana {
      DEXTrades(
        limitBy: { by: Trade_Buy_Currency_MintAddress, count: 1 }
        orderBy: { descending: Trade_Buy_Price }
        where: {
          Trade: {
            Dex: { ProtocolName: { is: "pump" } }
            Buy: {
              Currency: {
                MintAddress: { notIn: ["11111111111111111111111111111111"] }
              }
            }
          }
          Transaction: { Result: { Success: true } }
        }
      ) {
        Trade {
          Buy {
            Price
            PriceInUSD
            Currency {
              Name
              Symbol
              MintAddress
              Decimals
              Fungible
              Uri
            }
          }
        }
      }
    }
  }`,
  variables: "{}",
});

const config = {
  method: "post",
  maxBodyLength: Infinity,
  url: "https://streaming.bitquery.io/eap",
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": process.env.BITQUERY_API_KEY,
    Authorization: "Bearer " + process.env.ACCESS_TOKEN,
  },
  data: data,
};

axios
  .request(config)
  .then((response) => {
    // Save the response data as a JSON file
    fs.writeFileSync(
      "response.json",
      JSON.stringify(response.data, null, 2),
      "utf-8"
    );
    console.log("Data saved to response.json");
  })
  .catch((error) => {
    console.error("Error fetching data:", error);
  });
