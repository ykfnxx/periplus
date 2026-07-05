import { describe, expect, it } from "vitest"
import { mct5AProviderId, parseMct5AHtml } from "@/lib/places/importers/mct-5a"

describe("parseMct5AHtml", () => {
  it("extracts province, scenic place name and rating years from MCT HTML", () => {
    const html = `
      <div id="province">
        <div class="li"><div class="tit">北京</div>
          <div class="box">
            <div class="span"><a href="JavaScript:;">故宫博物院2007年</a></div>
          </div>
        </div>
        <div class="li"><div class="tit">浙江</div>
          <div class="box">
            <div class="span"><a href="JavaScript:;">杭州市杭州西湖风景区2007年</a></div>
          </div>
        </div>
        <div class="li"><div class="tit">河北</div>
          <div class="box">
            <div class="span"><a href="JavaScript:;">秦皇岛市山海关景区2007/2018年</a></div>
          </div>
        </div>
      </div>
    `

    const records = parseMct5AHtml(html, "https://example.test/mct-5a")

    expect(records).toMatchObject([
      {
        province: "北京",
        city: "北京市",
        name: "故宫博物院",
        years: [2007],
      },
      {
        province: "浙江",
        city: "杭州市",
        name: "杭州市杭州西湖风景区",
        years: [2007],
      },
      {
        province: "河北",
        city: "秦皇岛市",
        name: "秦皇岛市山海关景区",
        years: [2007, 2018],
      },
    ])
  })

  it("builds stable provider ids", () => {
    expect(mct5AProviderId({ province: "北京", name: "故宫博物院" })).toMatch(
      /^mct-5a-[a-f0-9]{12}$/
    )
    expect(mct5AProviderId({ province: "北京", name: "故宫博物院" })).toBe(
      mct5AProviderId({ province: "北京", name: "故宫博物院" })
    )
  })
})
