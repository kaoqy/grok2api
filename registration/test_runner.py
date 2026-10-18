import unittest
import calendar
import time

from registration.drission_runner import classify_email_step_text, mail_received_after
from registration.runner import order_domains, parse_domains, turnstile_checkbox_point, unavailable_signup_kind


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

    def test_headless_unavailable_page_is_not_reported_as_a_domain_rejection(self):
        self.assertEqual(unavailable_signup_kind(headless=True), "headless")

    def test_headed_unavailable_page_can_be_treated_as_a_domain_rejection(self):
        self.assertEqual(unavailable_signup_kind(headless=False), "domain")

    def test_turnstile_checkbox_point_targets_the_left_side_of_the_widget(self):
        self.assertEqual(
            turnstile_checkbox_point({"x": 475.0, "y": 458.0, "width": 384.0, "height": 72.0}),
            (507.0, 494.0),
        )

    def test_mail_received_after_treats_cloudflare_created_at_as_utc(self):
        cutoff = calendar.timegm(time.strptime("2026-10-18 09:02:30", "%Y-%m-%d %H:%M:%S"))
        self.assertTrue(
            mail_received_after(
                {"created_at": "2026-10-18 09:02:31"},
                cutoff,
            )
        )

    def test_email_signup_unavailable_is_classified_as_exit_risk(self):
        self.assertEqual(
            classify_email_step_text("Email sign-up isn’t available right now. Sign up another way."),
            "exit_risk",
        )


if __name__ == "__main__":
    unittest.main()
