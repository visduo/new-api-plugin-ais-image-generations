export const meta = {
    apiVersion: 1,
    key: "visduo_ais-image-generations",
    name: "AIS Service Image Generations",
    description: {
        en: "AIS Service image generation integration plugin",
        zh: "AIS Service 图像生成服务接入插件",
    },
    version: "3.1.1",
    author: { name: "多栈科技" },
    website: "https://ais.6os.net/",
    fetchMode: "per_task",
    upstreams: ["new_api"],
    models: [
        "ais-image-generations-test",
        "62-gpt-image-2-sisr",
        "62-gpt-image-2.5-flare-sisr",
        "62-gpt-image-2.5-sunburst-sisr",
        "62-gpt-image-2.6-flare-sisr",
        "62-gpt-image-2.6-sunburst-sisr",
        "66-gpt-image-2-adobe",
        "68-gemini-nano-banana-2-as",
        "68-gemini-nano-banana-pro-as",
        "68-gemini-nano-banana-2.1-as",
        "69-gpt-image-2-sisr",
        "69-gpt-image-2.5-flare-sisr",
        "69-gpt-image-2.5-sunburst-sisr",
        "69-gpt-image-2.6-flare-sisr",
        "69-gpt-image-2.6-sunburst-sisr",
        "70-gpt-image-2-adobe",
        "70-gpt-image-2.5-flare-adobe",
        "70-gpt-image-2.5-sunburst-adobe",
        "70-gpt-image-2.6-flare-adobe",
        "70-gpt-image-2.6-sunburst-adobe",
        "72-gpt-image-2-adobe",
        "72-gpt-image-2.5-flare-adobe",
        "72-gpt-image-2.5-sunburst-adobe",
        "72-gpt-image-2.6-flare-adobe",
        "72-gpt-image-2.6-sunburst-adobe",
        "82-gemini-nano-banana-2-as",
        "82-gemini-nano-banana-pro-as",
        "82-gemini-nano-banana-2.1-as",
        "83-gemini-nano-banana-2-as",
        "83-gemini-nano-banana-pro-as",
        "83-gemini-nano-banana-2.1-as",
        "86-gpt-image-2-sisr",
        "86-gpt-image-2.5-flare-sisr",
        "86-gpt-image-2.5-sunburst-sisr",
        "86-gpt-image-2.6-flare-sisr",
        "86-gpt-image-2.6-sunburst-sisr",
    ],
    usageSchema: {
        image_count: {
            type: "number",
            unit: "count",
            unitLabel: { en: "images", zh: "张" },
            description: { en: "Image generation unit price", zh: "图片生成单价" },
        },
    },
    usageExamples: [{ label: "1 张", facts: { image_count: 1 } }],
    routes: [
        {
            method: "POST",
            path: "/ais-image-generations/v1/jobs",
            type: "submit",
            decode: "decodeJob",
            render: "renderJob",
        },
        {
            method: "GET",
            path: "/ais-image-generations/v1/jobs/:task_id",
            type: "query",
            render: "renderJob",
        },
    ],
};

function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value) {
    return String(value === undefined || value === null ? "" : value).trim();
}

function authorization(ctx) {
    const key = typeof ctx.apiKey === "string" ? ctx.apiKey.trim() : "";
    if (key) {
        const token = key.replace(/^Bearer\s+/i, "");
        if (!token || /\s/.test(token)) {
            throw new Error("invalid upstream channel key");
        }
        return "Bearer " + token;
    }
    const header = typeof ctx.authHeader === "string" ? ctx.authHeader.trim() : "";
    if (/^Bearer\s+[^\s]+$/i.test(header)) {
        return header;
    }
    throw new Error("upstream channel key is missing");
}

function modelFor(ctx, params) {
    const model = trimmed(ctx.upstreamModel) || trimmed(ctx.model) || trimmed(params.model);
    if (!meta.models.includes(model)) {
        throw new Error("unsupported model: " + String(model || "<empty>"));
    }
    return model;
}

function imageInputs(params) {
    const values = [];
    for (const key of ["image", "images"]) {
        const value = params[key];
        if (value === undefined || value === null) {
            continue;
        }
        for (const item of Array.isArray(value) ? value : [value]) {
            if (typeof item !== "string" || !item.trim()) {
                throw new Error(key + " must contain non-empty image URLs or data URLs");
            }
            values.push(item.trim());
        }
    }
    return values;
}

function inputFor(ctx) {
    const input = ctx.requestBody;
    if (!object(input)) {
        throw new Error("request must be a JSON object");
    }
    const params = Object.assign({}, input);
    if (params.operation !== undefined) {
        throw new Error("operation is not supported; provide image or images to edit an image");
    }
    const images = imageInputs(params);
    return { params: params, images: images, endpoint: images.length > 0 ? "edits" : "generations" };
}

function taskData(source) {
    let data = object(source) ? source.data : null;
    for (let depth = 0; depth < 4 && object(data); depth++) {
        if (Array.isArray(data.images) ||
            Array.isArray(data.data) ||
            object(data.result) ||
            !object(data.data)) {
            break;
        }
        data = data.data;
    }
    return object(data) ? data : {};
}

function imageEntries(source) {
    const data = taskData(source);
    if (Array.isArray(data.images)) {
        return data.images;
    }
    if (Array.isArray(data.data)) {
        return data.data;
    }
    if (object(data.result)) {
        if (Array.isArray(data.result.images)) {
            return data.result.images;
        }
        if (Array.isArray(data.result.data)) {
            return data.result.data;
        }
    }
    return [];
}

function imageUrl(source, index) {
    const image = imageEntries(source)[index];
    const url = object(image) && image.url;
    return typeof url === "string" && /^https?:\/\/[^/\s?#]+(?:[/?#]|$)/i.test(url) ? url : "";
}

function renderTask(ctx, task) {
    const status = String(task.status || "").toUpperCase();
    const data = taskData(task);
    const model = trimmed(data.model) || trimmed(ctx.model) || trimmed(ctx.upstreamModel);
    const output = {
        id: task.task_id,
        object: "ais.job",
        type: "image",
        model: model,
        status: status === "SUCCESS" ? "succeeded" : status === "FAILURE" ? "failed" : "processing",
        progress: Number(String(task.progress || "").replace("%", "")) || 0,
        created_at: Number(task.created_at) || 0,
    };
    if (status === "SUCCESS") {
        output.completed_at = Number(task.finished_at) || 0;
        output.result = {
            images: imageEntries(task).map(function (image) {
                const item = { url: image.url || "" };
                if (image.revised_prompt) {
                    item.revised_prompt = image.revised_prompt;
                }
                return item;
            }),
        };
    }
    if (status === "FAILURE") {
        const error = object(data.error) ? data.error : {};
        output.completed_at = Number(task.finished_at) || 0;
        output.error = {
            code: trimmed(error.code) || "generation_failed",
            message: trimmed(task.fail_reason) || trimmed(error.message) || "Image generation failed",
        };
    }
    return output;
}

export const native = {
    decodeJob(ctx) {
        if (!ctx.body || ctx.body.kind !== "json") {
            throw new Error("JSON body required");
        }
        const input = inputFor({ requestBody: ctx.body.value });
        if (typeof input.params.prompt !== "string" || !input.params.prompt.trim()) {
            throw new Error("prompt must be a non-empty string");
        }
        const model = trimmed(ctx.model) || trimmed(input.params.model) || trimmed(ctx.upstreamModel);
        return {
            kind: "submit",
            model: model,
            action: input.endpoint === "edits" ? "image_to_image" : "text_to_image",
            requestBody: Object.assign({}, input.params, { model: model }),
        };
    },

    renderJob(ctx, task) {
        return renderTask(ctx, task);
    },

    error(ctx, error) {
        return {
            id: "",
            object: "ais.job",
            type: "image",
            status: "failed",
            error: {
                code: error.code || "invalid_request",
                message: error.message,
            },
        };
    },
};

export function buildSubmitRequest(ctx) {
    const input = inputFor(ctx);
    if (typeof input.params.prompt !== "string" || !input.params.prompt.trim()) {
        throw new Error("prompt must be a non-empty string");
    }
    const body = Object.assign({}, input.params, { model: modelFor(ctx, input.params) });
    const headers = { Authorization: authorization(ctx), "Content-Type": "application/json" };
    headers.Prefer = "respond-async";
    if (typeof ctx.publicTaskId === "string" && /^[A-Za-z0-9._-]{1,128}$/.test(ctx.publicTaskId)) {
        headers["Idempotency-Key"] = ctx.publicTaskId;
    }
    return {
        url: ctx.baseUrl.replace(/\/$/, "") + "/ais-image-generations/v1/jobs",
        method: "POST",
        headers: headers,
        action: input.endpoint === "edits" ? "image_to_image" : "text_to_image",
        body: body,
    };
}

export function parseSubmitResponse(ctx, response) {
    const body = response.body;
    if (!object(body)) {
        throw new Error("invalid upstream response");
    }
    if (body.error) {
        const error = object(body.error) ? body.error : { message: body.error };
        return {
            taskId: trimmed(ctx.publicTaskId) || "failed-submit",
            taskData: body,
            immediate: {
                code: 0,
                status: "FAILURE",
                progress: "100%",
                reason: trimmed(error.message) || "Image generation failed",
            },
        };
    }
    const id = body.id || body.task_id;
    if (![200, 201, 202].includes(response.statusCode) ||
        typeof id !== "string" ||
        !/^task_[A-Za-z0-9_-]{8,128}$/.test(id)) {
        throw new Error("upstream did not return a valid task id");
    }
    const model = trimmed(body.model) || trimmed(ctx.model) || trimmed(ctx.upstreamModel);
    return { taskId: id, taskData: Object.assign({}, body, { model: model }) };
}

export function buildQueryRequest(ctx) {
    const taskId = trimmed(ctx.taskId);
    if (!/^task_[A-Za-z0-9_-]{8,128}$/.test(taskId)) {
        throw new Error("invalid upstream task id");
    }
    return {
        url: ctx.baseUrl.replace(/\/$/, "") + "/ais-image-generations/v1/jobs/" + encodeURIComponent(taskId),
        method: "GET",
        headers: { Authorization: authorization(ctx) },
    };
}

export function parseTaskResult(ctx, body) {
    if (!object(body) || trimmed(body.id) !== trimmed(ctx.taskId)) {
        return { status: "UNKNOWN" };
    }
    const status = trimmed(body.status).toLowerCase();
    if (status === "queued") {
        return { status: "QUEUED" };
    }
    if (status === "processing") {
        return { status: "IN_PROGRESS" };
    }
    if (status === "succeeded") {
        return { status: "SUCCESS", url: imageUrl({ data: body }, 0) };
    }
    if (status === "failed") {
        return { status: "FAILURE", reason: trimmed(body.error && body.error.message) || "Image generation failed" };
    }
    return { status: "UNKNOWN" };
}

export function extractUsage(ctx) {
    return { image_count: 1 };
}

export function extractUsageOnComplete(task, taskResult, body) {
    if (!taskResult || taskResult.status !== "SUCCESS") {
        return null;
    }
    const images = imageEntries({ data: body });
    return images.length > 0 ? { image_count: images.length } : null;
}

export function listArtifacts(task) {
    if (!task || task.status !== "SUCCESS") {
        return [];
    }
    const artifacts = [];
    const images = imageEntries(task);
    for (let index = 0; index < images.length; index++) {
        if (imageUrl(task, index)) {
            artifacts.push({ key: "image-" + index, type: "image" });
        }
    }
    return artifacts;
}

export function buildContentRequest(ctx) {
    const key = String(ctx.artifactKey || "");
    if (!/^image-(0|[1-9][0-9]*)$/.test(key)) {
        throw new Error("artifact not found");
    }
    const url = imageUrl({ data: ctx.data }, Number(key.slice(6)));
    if (!url) {
        throw new Error("artifact not found");
    }
    return { url: url, method: ctx.clientRequest.method, credentialless: true };
}
