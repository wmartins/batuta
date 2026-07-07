# @batuta/remote

Server-side HTTP client and managed-storage adapter for Batuta.

```ts
import { Batuta } from "batuta";
import { BatutaStorage } from "@batuta/remote";

const storage = new BatutaStorage({
  baseUrl: process.env.BATUTA_URL!,
  apiKey: process.env.BATUTA_API_KEY!,
});

const batuta = new Batuta({ storage });
```

API keys are secrets. Never embed this package or a Batuta API key in a browser
bundle. The managed adapter intentionally uses the server's clock and ignores
the generic storage contract's client-side timestamps. Like Batuta itself,
`check()` and `record()` remain separate and non-atomic operations.
