import { describe, expect, test } from "bun:test";
import i18n from "i18next";

import en from "./resources/en";
import zhCN from "./resources/zh-CN";

async function translate(language: "en" | "zh-CN", key: string): Promise<string> {
	const instance = i18n.createInstance();
	await instance.init({
		resources: {
			en: { translation: en },
			"zh-CN": { translation: zhCN },
		},
		lng: language,
		fallbackLng: "en",
		interpolation: { escapeValue: false },
	});
	return instance.t(key);
}

describe("provider workspace translations", () => {
	test("English resource resolves provider workspace connection strings", async () => {
		expect(await translate("en", "settings.providerWs.connection.identity")).toBe("Identity");
		expect(await translate("en", "settings.providerWs.connection.addHeader")).toBe("Add header");
		expect(await translate("en", "settings.providerWs.import.open")).toBe("Import from cc-switch");
		expect(await translate("en", "common.actions.discard")).toBe("Discard");
		expect(await translate("en", "settings.providerWs.custom.title")).toBe("Add custom provider");
		expect(await translate("en", "settings.providerWs.delete.confirm")).toBe("Delete provider");
	});

	test("Simplified Chinese resource resolves provider workspace strings", async () => {
		expect(await translate("zh-CN", "settings.providerWs.connection.identity")).toBe("身份");
		expect(await translate("zh-CN", "settings.providerWs.connection.addHeader")).toBe("添加请求头");
		expect(await translate("zh-CN", "settings.providerWs.import.open")).toBe("从 cc-switch 导入");
		expect(await translate("zh-CN", "common.actions.discard")).toBe("放弃更改");
		expect(await translate("zh-CN", "settings.providerWs.custom.title")).toBe("新增自定义提供者");
		expect(await translate("zh-CN", "settings.providerWs.delete.confirm")).toBe("删除提供者");
	});

	test("unprefixed provider workspace paths are intentionally absent", async () => {
		expect(await translate("en", "providerWs.connection.identity")).toBe("providerWs.connection.identity");
	});
});
