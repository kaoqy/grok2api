import unittest

from registration.runner import order_domains, parse_domains


class DomainOrderingTest(unittest.TestCase):
    def test_parse_domains_trims_and_deduplicates_in_configured_order(self):
        self.assertEqual(
            parse_domains(" china-ai.top, kaoqy.me，china-ai.top, example.com "),
            ["china-ai.top", "kaoqy.me", "example.com"],
        )

    def test_order_domains_moves_rejected_domains_to_the_back(self):
        self.assertEqual(
            order_domains(
                ["china-ai.top", "kaoqy.me", "example.com"],
                {"china-ai.top"},
            ),
            ["kaoqy.me", "example.com", "china-ai.top"],
        )


if __name__ == "__main__":
    unittest.main()
