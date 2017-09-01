
/// <reference path= "../../_jsHelper/jsHelper/jsHelper.ts" />
/// <reference path= "../../XioPorted/PageParsers/7_PageParserFunctions.ts" />
/// <reference path= "../../XioPorted/PageParsers/1_Exceptions.ts" />
/// <reference path= "../../XioPorted/PageParsers/2_IDictionary.ts" />

$ = jQuery = jQuery.noConflict(true);
$xioDebug = true;
let Realm = getRealmOrError();
let CompanyId = getCompanyId();
let CurrentGameDate = parseGameDate(document, document.location.pathname);
let StoreKeyCode = "olsh";
let OllaID: number | null;

// упрощаем себе жисть, подставляем имя скрипта всегда в сообщении
function log(msg: string, ...args: any[]) {

    msg = "oligarh shagren: " + msg;
    logDebug(msg, ...args);
}

interface IShopData {
    cityName: string;
    innovations: string[];
    place: string;
    celebrity: number;
    visitors: string;
    service: string;
    shagreenProp: IProductProperties
}

interface ITodayDash {
    pid: number;
    pname: string;
    cid: number;
    cname: string;

    totalSum: number;

    shopid: number;
    shopname: string;
    shopData: IShopData | null;
}

interface IStoreItem {
    retailReport: ICityRetailReport;
    players: IDictionaryN<ITodayDash>;
}



async function run_async() {

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


    let n = nullCheck(extractIntPositive(document.location.pathname));
    OllaID = nullCheck(n[0]);

    // таблица с участниками. саму страницу тянем запросом чтобы не было косяков разных из за изменения страницы скриптами
    let html = await tryGet_async(document.location.pathname);
    let dashDict = parseDashboard(oneOrError($(html), "table.list"));

    // визуальная часть страницы
    let $tbl = oneOrError($(document), "table.list");
    drawNumbers($tbl);

    let $updateBtn = $("<input id='update' type='button' value='обновить'>");
    $tbl.before($updateBtn);
    $updateBtn.on("click.OLLA", async function (event) {
        try {
            $updateBtn.prop("disabled", true);
            await doUpdate_async(dashDict);
            document.location.reload();
        }
        catch (err) {
            let msg = (err as Error).message;
            $updateBtn.after(`<span>${msg}</span>`);
        }
        finally{
            $updateBtn.prop("disabled", false);
        }
    });

    let $exportBtn = $("<input id='export' type='button' value='экспорт'>");
    $exportBtn.insertAfter($updateBtn);
    $exportBtn.on("click.OLLA", event => {
        let $div = $("<div></div>");
        exportInfo($div);
        $tbl.before($div);
    });

    // выводит собственно данные
    function drawNumbers($tbl: JQuery) {

        let storedInfo = loadInfo();
        if (isEmpty(storedInfo))
            return;

        let prepared = prepareInfo(storedInfo, dateToShort(CurrentGameDate));
        if (prepared == null)
            return;

        // теперь в каждую строку выводим инфу о проданном сегодня и вообще
        for (let pid in prepared) {
            let [sold, total] = prepared[pid];

            let url = `/${Realm}/main/user/view/${pid}`;
            let $r = oneOrError($tbl, `a[href*='${url}']`).closest("tr");
            $r.children("td").eq(3).append(`<div style="color:red">sold:${sold}, total:${total}</div>`);
        }
    }    
}



/**
 * для каждого игрока в хранилище готовит данные вида pid = [sold, totalsold] на сегодняшнюю дату
 * @param storedInfo
 */
function prepareInfo(storedInfo: IDictionary<IStoreItem>, toDate: string): IDictionaryN<[number, number]> | null {

    // если данных на сегодня нет, то как бы возвращаем нулл
    //let todayKey = dateToShort(CurrentGameDate);
    if (storedInfo[toDate] == null)
        return null;
       

    let datesStr = Object.keys(storedInfo);
    datesStr.sort((a, b) => {
        let adate = dateFromShort(a);
        let bdate = dateFromShort(b);

        if (adate > bdate)
            return 1;

        if (adate < bdate)
            return -1;

        return 0;
    });
    log("sorted dates", datesStr);

    // проходим от меньшей даты к большей то есть до сегодня
    // в словаре ТОТАЛ продажи, Последняя выручка, Продажи за послед день
    let dict: IDictionaryN<[number, number, number]> = {};
    for (let dateKey of datesStr) {
        let info = storedInfo[dateKey];

        for (let pid in info.players) {
            let player = info.players[pid];

            if (dict[pid] == null)
                dict[pid] = [0, 0, 0];

            let [total, lastSum, sold] = dict[pid];

            // если за этот день нет данных для магазина, например магазина не стало
            if (player.shopData != null) {
                // сколько шагрени продали за день Х. Просто берем выручку за предыдущий период, вычитаем текущую и находим 
                sold = (player.totalSum - lastSum) / player.shopData.shagreenProp.price;
                if (sold < 0)
                    throw new Error(`получили отрицательные продажи шагрени для date:${dateKey}, pid: ${pid}, subid: ${player.shopid}`);

                sold = Math.round(sold);
                total += sold;
            }
            else {
                sold = 0;
            }


            dict[pid] = [total, player.totalSum, sold];
        }

        if (dateKey === toDate)
            break;
    }

    // подготовим результат. нужно для pid = продано сегодня, всего
    let resDict: IDictionaryN<[number, number]> = {};
    for (let pid in dict) {
        let [total, lastSum, sold] = dict[pid];
        resDict[pid] = [sold, total];
    }

    return resDict;
}

/**
 * Собираем данные записываем в хранилище
 * @param $rows
 */
async function doUpdate_async(dashDict: IDictionaryN<ITodayDash>) {

    let cityName = "";
    for (let pid in dashDict) {
        let info = dashDict[pid];
        log(`${info.pname} started.`);

        let shop = info.cid === CompanyId
            ? await getMyShopData_async(info.shopid)
            : await getShopData_async(info.shopid);

        info.shopData = shop;

        // это на будущее, чтобы запросить отчет по шагрени
        if (cityName == "" && shop != null)
            cityName = shop.cityName;
    }
    log("полный дашборд ", dashDict);
    
    // заберем характеристики самой шагрени на рынке
    let report = await getShagreenReport_async(cityName);
    log("report ", report);

    // пишем собранное в хранилище
    saveInfo(report, dashDict);
}

function parseDashboard($tbl: JQuery) {

    let $rows = $tbl.find("tr.even, tr.odd");

    let dashDict: IDictionaryN<ITodayDash> = {};
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

    return dashDict;
}

/**
 * записывает данные в хранилище добавляя новую запись если там уже что то есть
 * @param report
 * @param dashDict
 */
function saveInfo(report: ICityRetailReport, dashDict: IDictionaryN<ITodayDash>) {

    let storeKey = buildStoreKey(Realm, StoreKeyCode, nullCheck(OllaID));
    let storedInfo = loadInfo();

    // для сегодняшней даты нужно обновить данные и все
    let dateKey = dateToShort(CurrentGameDate);
    storedInfo[dateKey] = { retailReport: report, players: dashDict };
    
    localStorage[storeKey] = JSON.stringify(storedInfo);
    //log("сохранил ", localStorage[storeKey]);
}
/**
 * возвращает либо данные либо пустой словарь
 */
function loadInfo(): IDictionary<IStoreItem> {

    let storeKey = buildStoreKey(Realm, StoreKeyCode, nullCheck(OllaID));
    let storedInfo: IDictionary<IStoreItem> = {};
    if (localStorage[storeKey] != null)
        storedInfo = JSON.parse(localStorage[storeKey]);

    return storedInfo;
}

function exportInfo($place: JQuery) {
    if ($place.length <= 0)
        return false;

    if ($place.find("#txtExport").length > 0) {
        $place.find("#txtExport").remove();
        return false;
    }

    let $txt = $('<textarea id="txtExport" style="display:block;width: 800px; height: 200px"></textarea>');

    let storedInfo = loadInfo();
    let datesStr = Object.keys(storedInfo);
    datesStr.sort((a, b) => {
        let adate = dateFromShort(a);
        let bdate = dateFromShort(b);

        if (adate > bdate)
            return 1;

        if (adate < bdate)
            return -1;

        return 0;
    });

    let exportStr = "pname;city;date;subid;shopname;place;innovations;celebr;visitors;service;sold;index;locP;locQ;P;Q;B" + "\n";

    // начинаем идти с начала к концу по датам
    for (let dateKey of datesStr) {
        let info = storedInfo[dateKey];

        // на заданную дату делаем расчет кол-ва проданного и всего проданного
        let prepared = nullCheck(prepareInfo(storedInfo, dateKey));

        for (let pid in info.players) {
            let player = info.players[pid];
            let report = info.retailReport;
            let shop = player.shopData;
            if (shop == null) {
                log(`нет данных по магазину для pid:${pid}, date:${dateKey}`);
                continue;
            }

            // pname, city, datestr, subid. shopname, place, innovations
            let pstr = formatStr("{0};{1};{2};{3};{4};{5};{6};", player.pname, shop.cityName, dateKey, player.shopid, player.shopname, shop.place, shop.innovations.join("|"));

            // celebr, visitors, service, sold index
            let [sold, total] = nullCheck(prepared[pid]);
            pstr += formatStr("{0};{1};{2};{3};{4};", shop.celebrity, shop.visitors, shop.service, sold, MarketIndex[report.index]);

            // locP, locQ, P, Q, B
            let loc = report.locals;
            pstr += formatStr("{0};{1};{2};{3};{4}", loc.price, loc.quality, shop.shagreenProp.price, shop.shagreenProp.quality, shop.shagreenProp.brand);


            exportStr += pstr + "\n";
        }
    }


    $txt.text(exportStr);
    $place.append($txt);
    return true;
}

/**
 * розничный отчет по шагрени
 * @param cityName
 */
async function getShagreenReport_async(cityName: string): Promise<ICityRetailReport> {

    try {
        if (cityName.length <= 0)
            throw new Error("имя города для запроса отчета по шагрени не задано");

        // сначала забираем ее id
        let shid = await getShagreenId_async();

        // находим данные по городам и странам
        let cityDict = await getGeos_async();
        let [country, region, city] = cityDict[cityName];

        let url = `/${Realm}/window/globalreport/marketing/by_trade_at_cities/${shid}/${country.id}/${region.id}/${city.id}`;
        let html = await tryGet_async(url);
        let report = parseCityRetailReport(html, url);
        return report;
    }
    catch (err) {
        throw err;
    }
}

/**
 * по указанным субайди собирает данные по чужим магазинам
 * @param subids
 */
async function getShopData_async(subid: number): Promise<IShopData|null> {

    let url = `/${Realm}/main/unit/view/${subid}`;
    let html:any;
    try {
        html = await tryGet_async(url);

        // если чел выставил маг на продажу, значит парсить его не получится. такое бывает
        if ($(html).find(".headerButtonBuy").length > 0)
            return null;
    }
    catch (err) {
        log("", err);

        // если магазин вдруг удалили
        if (err["status"] = 404)
            return null;

        throw err;
    }
    
    let data = parseShopMain(html, url);
    return data;

        function parseShopMain(html: any, url: string): IShopData {
            let $html = $(html);

            try {

                // инновации
                let innov: string[] = [];
                let $slots = $html.find("div.artf_slots");
                if ($slots.length > 0) {
                    $slots.find("img").each((i, el) => {
                        let $img = $(el);

                        // обычно выглядит так: Маркетинг / Автомобильная парковка
                        let title = $img.attr("title");
                        let items = title.split("/");
                        let name = nullCheck(items[items.length - 1]).trim();

                        innov.push(name);
                    });
                }


                // таблица с данными по товарам
                let $tbl = oneOrError($html, "table.grid");
                let $infoBlock = oneOrError($html, "table.infoblock tbody");
                let $innovBlock = $html.find("div.artf_slots");     // может отсутствовать вовсе если нет инноваций

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
                let $shrow = oneOrError($tbl, "img[src*='shagreen.gif']").closest("tr");
                str = $shrow.children("td").eq(2).text();
                let quality = str.indexOf("не изв") < 0 ? numberfyOrError(str) : 0;

                str = $shrow.children("td").eq(3).text();
                let brand = str.indexOf("не изв") < 0 ? numberfyOrError(str, -1) : 0;

                str = $shrow.children("td").eq(4).text();
                let price = str.indexOf("не изв") < 0 ? numberfyOrError(str) : 0;

                return {
                    innovations: innov,
                    cityName: cityName,
                    place: place,
                    celebrity: celebr,
                    service: service,
                    visitors: visitors,
                    shagreenProp: { price: price, quality: quality, brand: brand }
                }
            }
            catch (err) {
                throw err;
            }
        }
}
/**
 * сбор данных чисто по моему магазину
 * @param subid
 * @param shagreenID
 */
async function getMyShopData_async(subid: number): Promise<IShopData> {
    let url = `/${Realm}/main/unit/view/${subid}`;
    let mainHtml = await tryGet_async(url);
    let main = parseUnitMainNew(mainHtml, url);
    let shop = main as any as IMainShop;

    // собираем инновации
    let innov: string[] = [];
    let $slots = $(mainHtml).find("div.artf_slots");
    if ($slots.length > 0) {
        $slots.find("img[title*='/']").each((i, el) => {
            let $img = $(el);

            // обычно выглядит так: Маркетинг / Автомобильная парковка
            let title = $img.attr("title");
            let items = title.split("/");
            let name = nullCheck(items[items.length - 1]).trim();

            innov.push(name);
        });
    }

    // трейдхолл
    url = `/${Realm}/main/unit/view/${subid}/trading_hall`;
    let hallHtml = await tryGet_async(url);
    let [filling, hall] = parseTradeHall(hallHtml, url);
    let thItem = hall.find(v => v.product.img.indexOf("shagreen.gif") >= 0);
    if (thItem == null)
        throw new Error("не нашел шагрени в своем магазине");

    // запросим отчет по продажам и найдем нужную дату
    let repHtml = await tryGet_async(thItem.historyUrl);
    let hist = parseRetailPriceHistory(repHtml, thItem.historyUrl);
    let datestr = dateToShort(CurrentGameDate);
    let hitem = hist.find(v => dateToShort(v.date) === datestr);
    let prop: IProductProperties = hitem == null
        ? { price: 0, brand: 0, quality: 0 }
        : { price: hitem.price, brand: hitem.brand, quality: hitem.quality };

    url = `/${Realm}/main/unit/view/${subid}/virtasement`;
    let adsHtml = await tryGet_async(url);
    let ads = parseAds(adsHtml, url);

    return {
        innovations: innov,
        cityName: main.city,
        place: shop.place,
        service: ServiceLevels[shop.service],
        visitors: shop.visitors.toString(),
        celebrity: ads.celebrity,
        shagreenProp: prop
    };
}



/**
 * Получаем все магазины компании
 */
async function getShops_async(): Promise<IDictionaryN<IUnit>> {

    // ставим фильтрацию на магазины, сбрасываем пагинацию.
    // парсим юниты, 
    // восстанавливаем пагинацию и фильтрацию

    // ставим фильтр в магазины и сбросим пагинацию
    await tryGet_async(`/${Realm}/main/common/util/setfiltering/dbunit/unitListWithProduction/class=1885/type=0/size=0`);
    await tryGet_async(`/${Realm}/main/common/util/setpaging/dbunit/unitListWithProduction/20000`);

    // забрали страничку с юнитами
    let html = await tryGet_async(`/${Realm}/main/company/view/${CompanyId}/unit_list`);

    // вернем пагинацию, и вернем назад установки фильтрации
    await tryGet_async(`/${Realm}/main/common/util/setpaging/dbunit/unitListWithProduction/400`);
    await tryGet_async($(".u-s").attr("href") || `/${Realm}/main/common/util/setfiltering/dbunit/unitListWithProduction/class=0/size=0/type=${$(".unittype").val()}`);

    // обработаем страничку и вернем результат
    let shops = parseUnitList(html, document.location.pathname);
    if (Object.keys(shops).length < 2)
        throw new Error("список магазинов не пришел");

    return shops;
}

/**
 * собирает всю информацию по странам регионам вклюая связующую таблицу между городами странами и регионами
 */
async function getGeos_async(): Promise<IDictionary<[ICountry, IRegion, ICity]>> {

    let countries_tpl = `/${Realm}/main/common/main_page/game_info/bonuses/country`;
    let regions_tpl = `/${Realm}/main/common/main_page/game_info/bonuses/region`;
    let cities_tpl = `/${Realm}/main/common/main_page/game_info/bonuses/city`;

    try {
        // сначала собираем данные по городам регионам отдельно
        let cntryhtml = await tryGet_async(countries_tpl);
        let countries = parseCountries(cntryhtml, countries_tpl);

        await tryGet_async(`/${Realm}/main/common/util/setpaging/report/regionBonus/20000`);
        let rhtml = await tryGet_async(regions_tpl);
        let regions = parseRegions(rhtml, regions_tpl);

        await tryGet_async(`/${Realm}/main/common/util/setpaging/report/cityBonus/20000`);
        let chtml = await tryGet_async(cities_tpl);
        let cities = parseCities(chtml, cities_tpl);

        // так как собранных данных недостаточно чтобы сделать связку, соберем доп данные для формирования связки
        // город = страна,регион
        // единственный простой способ это спарсить со страницы торговли селекты
        let html = await tryGet_async(`/${Realm}/main/globalreport/marketing/by_trade_at_cities`);
        let $html = $(html);
        let $options = $html.find("select").eq(3).children("option.geocombo");

        let dict: IDictionary<[ICountry, IRegion, ICity]> = {};
        $options.each((i, el) => {
            let $opt = $(el);

            let cityName = $opt.text().trim();
            if (cityName.length < 1)
                throw new Error("имя города не найдено");

            let items = ($opt.val() as string).split("/");  // /422607/422609/422626
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
}

/**
 * находит id шагрени. чтобы запросить розничный отчет потом
 */
async function getShagreenId_async(): Promise<number> {
    try {
        let url = `/${Realm}/main/common/main_page/game_info/products`;
        let html = await tryGet_async(url);

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
}


function nullCheck<T>(val: T | null) {

    if (val == null)
        throw new Error(`nullCheck Error`);

    return val;
}

$(document).ready(() => run_async());