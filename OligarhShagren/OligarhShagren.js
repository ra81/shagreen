/// <reference path= "../../_jsHelper/jsHelper/jsHelper.ts" />
/// <reference path= "../../XioPorted/PageParsers/7_PageParserFunctions.ts" />
/// <reference path= "../../XioPorted/PageParsers/1_Exceptions.ts" />
/// <reference path= "../../XioPorted/PageParsers/2_IDictionary.ts" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator.throw(value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments)).next());
    });
};
$ = jQuery = jQuery.noConflict(true);
$xioDebug = true;
let Realm = getRealmOrError();
let CompanyId = getCompanyId();
let CurrentGameDate = parseGameDate(document, document.location.pathname);
let StoreKeyCode = "olsh";
// упрощаем себе жисть, подставляем имя скрипта всегда в сообщении
function log(msg, ...args) {
    msg = "oligarh shagren: " + msg;
    logDebug(msg, ...args);
}
function run_async() {
    return __awaiter(this, void 0, void 0, function* () {
        // определим что мы на странице шагрени
        let url_rx = /\/[a-z]+\/main\/olla\/\d+$/i;
        if (!url_rx.test(document.location.pathname)) {
            log("мы не в шагрени");
            return;
        }
        // что именно на вкладке шагрени
        let onTab = $("ul.tabu li.sel").text().trim() === "Шагрень";
        if (!onTab) {
            log("мы не в шагрени");
            return;
        }
        // в таблице выводится сумма продаж шагрени за все время. поэтому все чо мы можем сделать
        // каждый день заходить, запоминать сумму и завтра получать разность.
        // зная разность, идем в магазин, смотрим цену, считаем число в штуках.
        // Знали сколько штук было вчера, сколько сегодня, выводим общее число и сколько за сегодня
        // таблица с участниками
        let $tbl = oneOrError($(document), "table.list");
        let $rows = $tbl.find("tr.even, tr.odd");
        let $updateBtn = $("<input type='button' value='обновить'>");
        $tbl.before($updateBtn);
        $updateBtn.on("click.OLLA", function (event) {
            return __awaiter(this, void 0, void 0, function* () {
                // парсим айди игрока, ссыль на маг и сумму по шагрени
                // TODO: если в кэшэ есть за сегодня уже все посчитанное то просто вывести инфу и все
                // могут появиться новые участники в процессе сие надо учесть. 
                let dashDict = {};
                $rows.each((i, el) => {
                    let $r = $(el);
                    let $tds = $r.children("td");
                    let $apname = oneOrError($tds.eq(1), "a");
                    let pname = $apname.text().trim();
                    let n = nullCheck(extractIntPositive($apname.attr("href")));
                    let pid = nullCheck(n[0]);
                    let $acname = oneOrError($tds.eq(2), "a");
                    let cname = $acname.text().trim();
                    let m = nullCheck(extractIntPositive($acname.attr("href")));
                    let cid = nullCheck(m[0]);
                    let sum = numberfyOrError($tds.eq(4).text(), -1);
                    let $ashop = oneOrError($tds.eq(4), "a");
                    let shopname = $ashop.text().trim();
                    let h = nullCheck(extractIntPositive($ashop.attr("href")));
                    let shopid = nullCheck(h[0]);
                    dashDict[pid] = {
                        pid: pid,
                        pname: pname,
                        cid: cid,
                        cname: cname,
                        totalSum: sum,
                        shopname: shopname,
                        shopid: shopid,
                        shopData: null
                    };
                });
                // зная весь список выбираем только чужие, и парсим их отдельно. свой юнит надо иначе
                let subids = [];
                for (let pid in dashDict) {
                    let info = dashDict[pid];
                    if (info.cid === CompanyId)
                        continue;
                    subids.push(info.shopid);
                }
                let shopsdata = yield getShopsData_async(subids);
                log("спарсили ", shopsdata);
            });
        });
    });
}
/**
 * по указанным субайди собирает данные по чужим магазинам
 * @param subids
 */
function getShopsData_async(subids) {
    return __awaiter(this, void 0, void 0, function* () {
        let dict = {};
        for (let subid of subids) {
            let url = `/${Realm}/main/unit/view/${subid}`;
            let html = yield tryGet_async(url);
            let data = parseShopMain(html, url);
            dict[subid] = data;
        }
        return dict;
    });
}
function parseShopMain(html, url) {
    let $html = $(html);
    try {
        // таблица с данными по товарам
        let $tbl = oneOrError($html, "table.grid");
        let $infoBlock = oneOrError($html, "table.infoblock tbody");
        let $innovBlock = $html.find("div.artf_slots"); // может отсутствовать вовсе если нет инноваций
        // название города где маг стоит
        let cityName = oneOrError($infoBlock, "tr:contains('Расположение')").find("td:eq(1)").text().split("(")[0].trim();
        if (cityName.length === 0)
            throw new Error("не нашел имя города в котором стоит магазин " + url);
        // Район
        let place = oneOrError($infoBlock, "tr:contains('Район')").find("td:eq(1)").text().split(/\s+/i)[0].trim();
        if (place.length === 0)
            throw new Error("не нашел район города в котором стоит магазин " + url);
        // Известность
        let str = oneOrError($infoBlock, "tr:contains('Известность')").find("td:eq(1)").text();
        let celebr = numberfyOrError(str, -1);
        // Число посетителей
        str = oneOrError($infoBlock, "tr:contains('посетителей')").find("td:eq(1)").text();
        let visitors = str.trim();
        // сервис
        str = oneOrError($infoBlock, "tr:contains('сервис')").find("td:eq(1)").text();
        let service = str.trim();
        // /img/products/shagreen.gif
        str = $tbl.find("img[src*=shagreen.gif]").closest("tr").children("td").eq(4).text();
        let price = str.indexOf("не изв") < 0 ? numberfyOrError(str, -1) : 0;
        return {
            cityName: cityName,
            place: place,
            celebrity: celebr,
            service: service,
            visitors: visitors,
            price: price
        };
    }
    catch (err) {
        throw err;
    }
}
/**
 * Получаем все магазины компании
 */
function getShops_async() {
    return __awaiter(this, void 0, void 0, function* () {
        // ставим фильтрацию на магазины, сбрасываем пагинацию.
        // парсим юниты, 
        // восстанавливаем пагинацию и фильтрацию
        // ставим фильтр в магазины и сбросим пагинацию
        yield tryGet_async(`/${Realm}/main/common/util/setfiltering/dbunit/unitListWithProduction/class=1885/type=0/size=0`);
        yield tryGet_async(`/${Realm}/main/common/util/setpaging/dbunit/unitListWithProduction/20000`);
        // забрали страничку с юнитами
        let html = yield tryGet_async(`/${Realm}/main/company/view/${CompanyId}/unit_list`);
        // вернем пагинацию, и вернем назад установки фильтрации
        yield tryGet_async(`/${Realm}/main/common/util/setpaging/dbunit/unitListWithProduction/400`);
        yield tryGet_async($(".u-s").attr("href") || `/${Realm}/main/common/util/setfiltering/dbunit/unitListWithProduction/class=0/size=0/type=${$(".unittype").val()}`);
        // обработаем страничку и вернем результат
        let shops = parseUnitList(html, document.location.pathname);
        if (Object.keys(shops).length < 2)
            throw new Error("список магазинов не пришел");
        return shops;
    });
}
/**
 * собирает всю информацию по странам регионам вклюая связующую таблицу между городами странами и регионами
 */
function getGeos_async() {
    return __awaiter(this, void 0, void 0, function* () {
        let countries_tpl = `/${Realm}/main/common/main_page/game_info/bonuses/country`;
        let regions_tpl = `/${Realm}/main/common/main_page/game_info/bonuses/region`;
        let cities_tpl = `/${Realm}/main/common/main_page/game_info/bonuses/city`;
        try {
            // сначала собираем данные по городам регионам отдельно
            let cntryhtml = yield tryGet_async(countries_tpl);
            let countries = parseCountries(cntryhtml, countries_tpl);
            yield tryGet_async(`/${Realm}/main/common/util/setpaging/report/regionBonus/20000`);
            let rhtml = yield tryGet_async(regions_tpl);
            let regions = parseRegions(rhtml, regions_tpl);
            yield tryGet_async(`/${Realm}/main/common/util/setpaging/report/cityBonus/20000`);
            let chtml = yield tryGet_async(cities_tpl);
            let cities = parseCities(chtml, cities_tpl);
            // так как собранных данных недостаточно чтобы сделать связку, соберем доп данные для формирования связки
            // город = страна,регион
            // единственный простой способ это спарсить со страницы торговли селекты
            let html = yield tryGet_async(`/${Realm}/main/globalreport/marketing/by_trade_at_cities`);
            let $html = $(html);
            let $options = $html.find("select").eq(3).children("option.geocombo");
            let dict = {};
            $options.each((i, el) => {
                let $opt = $(el);
                let cityName = $opt.text().trim();
                if (cityName.length < 1)
                    throw new Error("имя города не найдено");
                let items = $opt.val().split("/"); // /422607/422609/422626
                if (items.length != 4)
                    throw new Error("ошибка сбора связки по городам регионам");
                let countryID = numberfyOrError(items[1]);
                let regID = numberfyOrError(items[2]);
                let cityID = numberfyOrError(items[3]);
                let country = countries.find(v => v.id === countryID);
                let region = regions.find(v => v.id === regID);
                let city = cities.find(v => v.id === cityID);
                if (country == null || region == null || city == null)
                    throw new Error("ошибка связывания городов и стран для города " + cityName);
                if (dict[cityName] != null)
                    throw new Error(`город ${cityName} повторяется 2 раза`);
                dict[cityName] = [country, region, city];
            });
            return dict;
        }
        catch (err) {
            throw err;
        }
    });
}
/**
 * находит id шагрени. чтобы запросить розничный отчет потом
 */
function getShagreenId_async() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let url = `/${Realm}/main/common/main_page/game_info/products`;
            let html = yield tryGet_async(url);
            // /olga/main/product/info/423040
            let $html = $(html);
            let href = oneOrError($html, "img[src*='shagreen.gif']").closest("a").attr("href");
            let n = extractIntPositive(href);
            if (n == null || n.length !== 1)
                throw new Error("не нашел id шагрени");
            return n[0];
        }
        catch (err) {
            throw err;
        }
    });
}
function nullCheck(val) {
    if (val == null)
        throw new Error(`nullCheck Error`);
    return val;
}
$(document).ready(() => run_async());
