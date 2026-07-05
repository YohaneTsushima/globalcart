/**
 * AddressForm - 标准化收货信息填写表单
 * 字段规范：
 *   受取人お名前（收件人名）         recipient_name  必填
 *   受取人国名（收件国家）           country         必填
 *   住所1 部屋番号、マンション名（房间号码，公寓名）  addr1   必填
 *   住所2 ○番－○号 町名、○丁目（详细地址）         addr2   必填
 *   住所3 区市町村名（市，区）                       addr3   非必填
 *   州名など（省等）                 state           必填
 *   連絡先電話番号（联系方式）        phone           必填
 *
 * Props:
 *   value: { recipient_name, country, addr1, addr2, addr3, state, phone }
 *   onChange: (updatedValue) => void
 *   className?: string
 */
import CountrySelect from "@/components/common/CountrySelect";
import { Input } from "@/components/ui/input";

// Map country code → phone dial code
const COUNTRY_PHONE_CODES = {
  CN: "+86", TW: "+886", KR: "+82", HK: "+852", MO: "+853",
  JP: "+81", US: "+1", CA: "+1", MX: "+52",
  AU: "+61", NZ: "+64",
  GB: "+44", DE: "+49", FR: "+33", IT: "+39", ES: "+34",
  NL: "+31", BE: "+32", AT: "+43", CH: "+41", SE: "+46",
  NO: "+47", DK: "+45", FI: "+358", PL: "+48", PT: "+351",
  RU: "+7", UA: "+380", CZ: "+420", SK: "+421", HU: "+36",
  RO: "+40", BG: "+359", HR: "+385", GR: "+30", IE: "+353",
  TR: "+90", IL: "+972", SA: "+966", AE: "+971", QA: "+974",
  KW: "+965", OM: "+968", BH: "+973", JO: "+962", LB: "+961",
  IN: "+91", ID: "+62", TH: "+66", VN: "+84", MY: "+60",
  SG: "+65", PH: "+63", PK: "+92", BD: "+880", NP: "+977",
  LK: "+94", MM: "+95", MN: "+976",
  BR: "+55", AR: "+54", CL: "+56", CO: "+57", PE: "+51",
  VE: "+58", MX: "+52",
  ZA: "+27", EG: "+20", NG: "+234", KE: "+254",
};

function getPhoneCode(countryCode) {
  return COUNTRY_PHONE_CODES[countryCode] || "";
}

function FieldLabel({ jp, zh, required = true }) {
  return (
    <label className="block mb-1">
      {required && <span className="text-red-500 mr-0.5">*</span>}
      <span className="text-xs font-semibold text-gray-700">{jp}</span>
      <span className="text-xs text-gray-400 ml-1">（{zh}）</span>
      {!required && <span className="text-xs text-gray-300 ml-1">任意</span>}
    </label>
  );
}

export const EMPTY_ADDRESS_FORM = {
  recipient_name: "",
  country: "",
  addr1: "",
  addr2: "",
  addr3: "",
  state: "",
  phone: "",
};

/**
 * Serialize structured address fields into a readable full_text string for display/storage.
 */
export function serializeAddressToText(v) {
  return [
    v.recipient_name,
    v.phone,
    v.country,
    v.state,
    v.addr3,
    v.addr2,
    v.addr1,
  ].filter(Boolean).join("\n");
}

/**
 * Check if all required fields are filled.
 */
export function isAddressFormValid(v) {
  return !!(v.recipient_name?.trim() && v.country?.trim() && v.addr1?.trim() && v.addr2?.trim() && v.state?.trim() && v.phone?.trim());
}

export default function AddressForm({ value, onChange, className = "", error = false }) {
  // Only pass the single changed field as a partial object.
  // The caller (AddressBlock) merges it with its own state via functional setState,
  // so there's no risk of stale-snapshot overwrites between rapid field changes.
  const f = (k, v) => onChange({ [k]: v });

  const phoneCode = getPhoneCode(value.country);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 受取人お名前 */}
      <div>
        <FieldLabel jp="受取人お名前" zh="收件人名" required />
        <Input
          className={`h-8 text-sm bg-white ${error && !value.recipient_name?.trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
          placeholder="例：山田 太郎 / 张三"
          value={value.recipient_name || ""}
          onChange={e => f("recipient_name", e.target.value)}
        />
      </div>

      {/* 受取人国名 */}
      <div>
        <FieldLabel jp="受取人国名" zh="收件国家" required />
        <CountrySelect
          value={value.country || ""}
          onChange={v => f("country", v)}
          placeholder="选择国家"
          className={error && !value.country?.trim() ? "border-red-400" : ""}
        />
      </div>

      {/* 住所1 */}
      <div>
        <FieldLabel jp="住所1　部屋番号、マンション名" zh="房间号码，公寓名" required />
        <Input
          className={`h-8 text-sm bg-white ${error && !value.addr1?.trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
          placeholder="例：201号室、グリーンマンション"
          value={value.addr1 || ""}
          onChange={e => f("addr1", e.target.value)}
        />
      </div>

      {/* 住所2 */}
      <div>
        <FieldLabel jp="住所2　○番－○号　町名、○丁目" zh="详细地址" required />
        <Input
          className={`h-8 text-sm bg-white ${error && !value.addr2?.trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
          placeholder="例：1番2号 渋谷1丁目 / 建国路88号"
          value={value.addr2 || ""}
          onChange={e => f("addr2", e.target.value)}
        />
      </div>

      {/* 住所3 */}
      <div>
        <FieldLabel jp="住所3　区市町村名" zh="市，区" required={false} />
        <Input
          className="h-8 text-sm bg-white"
          placeholder="例：渋谷区 / 朝阳区（可不填）"
          value={value.addr3 || ""}
          onChange={e => f("addr3", e.target.value)}
        />
      </div>

      {/* 州名など */}
      <div>
        <FieldLabel jp="州名など" zh="省等" required />
        <Input
          className={`h-8 text-sm bg-white ${error && !value.state?.trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
          placeholder="例：東京都 / 北京市 / California"
          value={value.state || ""}
          onChange={e => f("state", e.target.value)}
        />
      </div>

      {/* 連絡先電話番号 */}
      <div>
        <FieldLabel jp="連絡先電話番号" zh="联系方式" required />
        <div className="flex items-center gap-2">
          {phoneCode && !value.phone?.startsWith(phoneCode) && (
            <div className="flex-shrink-0 h-8 px-2.5 flex items-center rounded-md border border-input bg-muted text-sm text-gray-600 font-medium select-none">
              {phoneCode}
            </div>
          )}
          <Input
            className={`h-8 text-sm bg-white flex-1 ${error && !value.phone?.trim() ? "border-red-400 placeholder:text-red-400 focus-visible:ring-red-300" : ""}`}
            placeholder="例：138 0000 0000"
            value={value.phone || ""}
            onChange={e => f("phone", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}