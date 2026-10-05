# Astroneum documentation

Pick the guide that matches what you are trying to do.

```mermaid
%% diagram: where-to-start
flowchart TD
    Start{"What do you want to do?"} --> A["Put a chart<br/>on a page"]
    Start --> B["Show my own<br/>market data"]
    Start --> C["Understand how<br/>it works"]
    Start --> D["Look up a prop<br/>or method"]
    Start --> E["Add my own<br/>indicator"]

    A --> A1["Getting started"]
    B --> B1["Datafeed guide"]
    C --> C1["How it works"]
    D --> D1["API reference"]
    E --> E1["Plugin guide"]

```

| Guide | Read it when | Time |
|---|---|---|
| [Getting started](./getting-started.md) | you are new. Ten small steps from an empty folder to a live chart, with a picture of what you should see after each | 20 min |
| [How it works](./architecture.md) | you want the mental model: the parts, how data flows, how chart types and indicators are made, how releases happen | 15 min |
| [Datafeed guide](./datafeed-guide.md) | you want to connect a REST API or WebSocket | 15 min |
| [API reference](./api.md) | you need the exact name or type of something | lookup |
| [Plugin guide](./plugin-development.md) | the built-in indicators are not enough | 30 min |

## Learning path

```mermaid
%% diagram: learning-path
flowchart LR
    A["Getting started<br/>steps 1 to 3"] --> B["Datafeed guide"]
    B --> C["Getting started<br/>steps 6 to 8"]
    C --> D["How it works"]
    D --> E["Plugin guide"]
    style A fill:#1f6feb,color:#fff,stroke:#1f6feb
```

Start at the blue box. You can stop after the first two boxes and have a working chart on
your own data.

## Also useful

- **Live demo:** [every chart type on live data](https://kowito.github.io/astroneum/demo/)
- **Changelog:** [what changed in each version](../CHANGELOG.md)
- **Contributing:** [set up the repo, run the checks](../CONTRIBUTING.md)
