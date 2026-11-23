import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone
from services.market_data_service import UpstoxMarketDataProvider


class TestUpstoxMarketDataProvider(unittest.TestCase):
    def test_missing_credentials_marked_blocked(self):
        """When Upstox credentials are not configured, is_available is False and quote returns None."""
        provider = UpstoxMarketDataProvider(api_key=None, access_token=None)
        self.assertFalse(provider.is_available())
        quote = provider.get_quote("TCS", "NSE")
        self.assertIsNone(quote)

    @patch("services.market_data_service.httpx.Client")
    def test_upstream_error_handled_gracefully(self, mock_client_cls):
        """When upstream returns 401 or error, returns None without raising or inventing data."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = '{"error": "Unauthorized"}'
        mock_client.get.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = UpstoxMarketDataProvider(api_key="test_key", access_token="test_token")
        self.assertTrue(provider.is_available())
        quote = provider.get_quote("TCS", "NSE")
        self.assertIsNone(quote)

    @patch("services.market_data_service.httpx.Client")
    def test_valid_quote_preserves_metadata(self, mock_client_cls):
        """Valid response preserves source='Upstox', timestamps, and freshness."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "data": {
                "NSE_EQ|TCS": {
                    "last_price": 2460.00,
                    "close": 2400.00,
                    "timestamp": "2026-11-23T10:00:00Z",
                    "ohlc": {
                        "open": 2410.0,
                        "high": 2470.0,
                        "low": 2400.0,
                        "close": 2400.0,
                    },
                    "volume": 1250000,
                }
            }
        }
        mock_client.get.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = UpstoxMarketDataProvider(api_key="test_key", access_token="test_token")
        quote = provider.get_quote("TCS", "NSE")
        self.assertIsNotNone(quote)
        self.assertEqual(quote["symbol"], "TCS")
        self.assertEqual(quote["exchange"], "NSE")
        self.assertEqual(quote["price"], 2460.00)
        self.assertEqual(quote["source"], "Upstox")
        self.assertEqual(quote["as_of"], "2026-11-23T10:00:00+00:00")
        self.assertEqual(quote["status"], "ok")


if __name__ == "__main__":
    unittest.main()
