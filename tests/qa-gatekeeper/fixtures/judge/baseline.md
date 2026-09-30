# mini baseline for the judge test

Prose is for humans and MUST be ignored by the judge: mentioning
Sample.Tests.ArticlesTests in a sentence must NOT suppress it.

```lane6-suppress
# full-name suppression:
Sample.Tests.ApprovalFlow.Delete_requires_approval
# class suppression (suppresses every test in the class):
Sample.Tests.HeaderTests
# near-miss: a PREFIX of Sample.Tests.ArticlesTests; whole-line exact must NOT over-match it:
Sample.Tests.Articles
# junit class suppression with a trailing comment:
com.example.CheckoutTest   # flaky on shared DB, see reviews/1234/
```
