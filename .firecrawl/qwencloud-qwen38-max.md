[![QwenCloud LOGO](https://img.alicdn.com/imgextra/i3/O1CN01FxM4fV22z4rr5xJN0_!!6000000007190-55-tps-158-28.svg)![QwenCloud LOGO](https://img.alicdn.com/imgextra/i4/O1CN01SuIK6l1PPZ8wnefSt_!!6000000001833-55-tps-158-28.svg)](https://www.qwencloud.com/)

⌘K

[Model Marketplace](https://www.qwencloud.com/models)

### Qwen3.8-Max

qwen3.8-max

Copy success!

[Try AI](https://www.qwencloud.com/try-ai/chat?models=qwen3.8-max) Call APIAdd to Compare

Text & Code

## Overview

Text & Code

2.4-trillion-parameter MoE flagship delivering a comprehensive leap in coding and professional work. Autonomously codes and delivers complete projects spanning 10+ days. Handles hundreds of specialized tasks across legal, financial, design, and other professional domains, producing production-grade results end-to-end in a single conversation. Native visual understanding runs through the full cycle of planning, execution, and verification, enabling deep semantic analysis of ultra-long documents and extended video content. In long-horizon tasks, plans autonomously, iterates through closed feedback loops, and continuously evolves.

#### Input

ImageTextVideo

#### Output

Text

## Features

#### Prefix Completion

Enable Partial Mode when calling the Qwen API to make the model continue strictly from your provided prefix text. [View docs](https://docs.qwencloud.com/developer-guides/text-generation/partial-mode)

#### Function Calling

Use function calling to connect large language models with external tools and systems. [View docs](https://docs.qwencloud.com/developer-guides/text-generation/function-calling)

#### Cache

Context Cache stores shared prefixes for long-context requests to reduce repeated computation, improve latency, and lower cost. [View docs](https://docs.qwencloud.com/developer-guides/text-generation/context-cache#implicit-cache)

#### Structured Outputs

Structured Outputs help ensure the model returns a JSON string in the expected format. [View docs](https://docs.qwencloud.com/developer-guides/text-generation/structured-output)

#### Batches

Asynchronously process requests in batches to reduce costs. [View docs](https://docs.qwencloud.com/developer-guides/run-and-scale/cost-optimization#batch-calling)

#### Web Search

Enable web search so the model can answer with real-time retrieved data. [View docs](https://docs.qwencloud.com/developer-guides/text-generation/web-search#enable-web-search)

#### Fine-tuning

Train models on sample data to better adapt them to specific tasks. [View docs](https://docs.qwencloud.com/developer-guides/fine-tuning/overview)

## Pricing

ModelsBuilt-in Tools

- Input
$2Per 1M tokens

- Output
$6Per 1M tokens

- Input(Implicit Cache)
$0.25Per 1M tokens

- Explicit Cache Creation
$2.5Per 1M tokens

- Explicit Cache Read
$0.17Per 1M tokens


## Rate Limits & Context

- Max Input
991K

- Max Output
131K

- Max Input (Thinking)
983K

- Max Output (Thinking)
131K

- Context
1M

- Max Reasoning
262K

- TPMTokens Per Minute
2M

- RPMRequests Per Minute
15K


## Built-in Tools

[code\_interpreter](https://docs.qwencloud.com/developer-guides/text-generation/code-interpreter) Responses API

[web\_extractor](https://docs.qwencloud.com/developer-guides/text-generation/web-scraping) Responses API

[web\_search](https://docs.qwencloud.com/developer-guides/text-generation/web-search) Responses API

[t2i\_search](https://docs.qwencloud.com/developer-guides/text-generation/image-search) Responses API

[i2i\_search](https://docs.qwencloud.com/developer-guides/text-generation/image-search) Responses API

## API Reference

[Call API](https://home.qwencloud.com/api-keys)

OpenAIDashScope

PythonNode.jscURL

Python

CompletionsAPIResponsesAPI

Copy success!

123456789101112131415161718192021222324252627282930

```
from openai import OpenAI
import os

client = OpenAI(
    # If the environment variable is not set, replace it with your Model Studio API key: api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
)

messages = [{"role": "user", "content": "Who are you"}]
completion = client.chat.completions.create(
    model="qwen3.8-max",  # You can replace this with another deep thinking models
    messages=messages,
    extra_body={"enable_thinking": True},
    stream=True
)
is_answering = False  # Indicates whether the response phase has started
print("\n" + "=" * 20 + "Thinking process" + "=" * 20)
for chunk in completion:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    if hasattr(delta, "reasoning_content") and delta.reasoning_content is not None:
        if not is_answering:
            print(delta.reasoning_content, end="", flush=True)
    if hasattr(delta, "content") and delta.content:
        if not is_answering:
            print("\n" + "=" * 20 + "Full response" + "=" * 20)
            is_answering = True
        print(delta.content, end="", flush=True)
```

CompletionsAPI

PythonNode.jscURL

Python

Copy success!

123456789101112131415161718192021222324252627282930

```
from openai import OpenAI
import os

client = OpenAI(
    # If the environment variable is not set, replace it with your Model Studio API key: api_key="sk-xxx"
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
)

messages = [{"role": "user", "content": "Who are you"}]
completion = client.chat.completions.create(
    model="qwen3.8-max",  # You can replace this with another deep thinking models
    messages=messages,
    extra_body={"enable_thinking": True},
    stream=True
)
is_answering = False  # Indicates whether the response phase has started
print("\n" + "=" * 20 + "Thinking process" + "=" * 20)
for chunk in completion:
    if not chunk.choices:
        continue
    delta = chunk.choices[0].delta
    if hasattr(delta, "reasoning_content") and delta.reasoning_content is not None:
        if not is_answering:
            print(delta.reasoning_content, end="", flush=True)
    if hasattr(delta, "content") and delta.content:
        if not is_answering:
            print("\n" + "=" * 20 + "Full response" + "=" * 20)
            is_answering = True
        print(delta.content, end="", flush=True)
```

Qwen3.8-Max

qwen3.8-max

Copy success!

Highlights

This site uses cookies and related technologies, as described in our Cookies Notice, for purposes that may include site operation, analytics, enhanced user experience, or advertizing. You may choose to consent to our use of these technologies, or manage your own preferences.

[Cookies Notice](https://www.qwencloud.com/legal/cookie)Reject AllAccept All

[Cookies Notice](https://www.qwencloud.com/legal/cookie)

## Cookie Settings

This site uses cookies and related technologies, as described in our Cookies Notice, for purposes that may include site operation, analytics, enhanced user experience, or advertizing. You may choose to consent to our use of these technologies, or manage your own preferences.

Accept AllReject All

Cookies and Related Technologies on This Site

[Get Started](https://account.qwencloud.com/sso/OIDCAuth?oauth_callback=https%3A%2F%2Fhome.qwencloud.com%2F)