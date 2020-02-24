import axios from "axios";
import cheerio from "cheerio";
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

query();

function query() {
  rl.question("Bukkit API Doc Url? ", async url => {
    console.log(url);
    await fetchUrl(url);
    return query();
  });
}

async function fetchUrl(url) {
  if (!url) {
    console.log("You must pass in a url as an argument");
    return;
  }
  console.log(`Fetching ${url}`);
  const html = await axios.get(url);
  const $ = cheerio.load(html.data, {
    normalizeWhitespace: true,
    decodeEntities: false
  });

  const classname = $(".inheritance")
    .last()
    .text()
    .split("\n")
    .join("");

  /** Generate interface signature */
  const interfaceName = $(".header .title")
    .text()
    .replace("Interface ", "")
    .replace("Enum ", "")
    .replace("Class", "");

  const extendsInterfaces = $(".typeNameLabel")
    .parent()
    .children()
    .map((i, e) => $(e).text())
    .get()
    .filter(
      n =>
        n.trim() != interfaceName.trim() &&
        n.trim() != "Enum" &&
        n.trim != "@Deprecated"
    )
    .join(", ");

  const classConstructors = $(".memberSummary")
    .filter(
      (i, e) =>
        $(e).attr("summary") ==
        "Constructor Summary table, listing constructors, and an explanation"
    )
    .find(".colConstructorName")
    .map(extractCtors($, interfaceName))
    .get()
    .join("\n");

  const enums = $(".memberSummary")
    .filter(
      (i, e) =>
        $(e).attr("summary") ==
        "Enum Constant Summary table, listing enum constants, and an explanation"
    )
    .find("tr")
    .map(extractEnum($, interfaceName))
    .get()
    .join("\n");

  const fields = $(".memberSummary")
    .filter(
      (i, e) =>
        $(e).attr("summary") ==
        "Field Summary table, listing fields, and an explanation"
    )
    .find("tr")
    .map(extractFields($, interfaceName))
    .get()
    .join("\n");

  const methods = $(".memberSummary")
    .filter(
      (i, e) =>
        $(e).attr("summary") ==
        "Method Summary table, listing methods, and an explanation"
    )
    .find("tr")
    .map(extractMethod($))
    .get()
    .join("\n");

  if (enums) {
    console.log(
      `\ninterface Java{\n\ttype(type: '${classname}'): ${interfaceName}s\n}`
    );
    console.log(`\ninterface ${interfaceName}s {`);
    console.log(enums);
    console.log("}");
  } else if (classConstructors) {
    console.log(
      `\ninterface Java{\n\ttype(type: '${classname}'): ${interfaceName}Constructor\n}`
    );
    console.log(`\ninterface ${interfaceName}Constructor {`);
    console.log(classConstructors);
    console.log("}");
  } else {
    if (classname)
      console.log(
        `\ninterface Java{\n\ttype(type: '${classname}'): ${interfaceName}\n}`
      );
  }

  const extendsStatement = extendsInterfaces
    ? ` extends ${extendsInterfaces} `
    : " ";

  console.log(`\ninterface ${interfaceName}${extendsStatement}{`);
  if (fields) {
    console.log(fields);
  }
  console.log(methods);
  console.log("}");
}

function extractFields($, interfaceName) {
  return function(i, e) {
    const returnValue = convertJavaTypeToJS(
      $(e)
        .find($(".colFirst"))
        .text()
        .replace("static", "")
        .trim()
    );
    const fieldName = $(e)
      .find($(".colSecond"))
      .text();
    const description = $(e)
      .find($(".colLast"))
      .text()
      .split("\n")
      .join("");
    return description == "Description"
      ? ""
      : "\t/** " + description + "*/\n\t" + fieldName + ": " + returnValue;
  };
}

function extractCtors($, interfaceName) {
  return function(i, e) {
    const wholeSignature =
      "new(" +
      $(e)
        .find($("code"))
        .text()
        .split("(")[1];
    return "\t" + convertJavaToJS(wholeSignature) + ": " + interfaceName;
  };
}

function extractEnum($, interfaceName) {
  return function(i, e) {
    const value = $(e)
      .find($(".colFirst"))
      .text();
    const description = $(e)
      .find($(".colLast"))
      .text()
      .split("\n")
      .join("");

    return description === "Description"
      ? ""
      : `\t/** ${description} */\n\t${value}: ${interfaceName}`;
  };
}

function extractMethod($) {
  return function(i, e) {
    const returnValue = $(e)
      .find($(".colFirst"))
      .text();
    const javaMethod = $(e)
      .find($(".colSecond"))
      .text();
    const description = $(e)
      .find($(".colLast"))
      .text()
      .split("\n")
      .join("");
    const jsMethod =
      javaMethod === "Method" || javaMethod == "" || javaMethod == "Class"
        ? ""
        : convertJavaToJS(javaMethod);
    return description === "Description"
      ? ""
      : `\t/** ${description} */\n\t${jsMethod}: ${convertJavaTypeToJS(
          returnValue
        )}`;
  };
}

function convertJavaToJS(javaMethod) {
  // console.log({ javaMethod });
  const pieces = javaMethod
    .split("\n")
    .join(" ")
    .split("(");
  const methodName = pieces[0];
  const variables = pieces[1].split(", ");
  const convertedVariables = variables
    .map(v => {
      if (v === ")") return undefined;
      const splitVar = v.split("\xa0");
      // console.log({ splitVar });
      const javaType = splitVar[0];
      const varName = splitVar[1].replace(")", "");
      return `${varName}: ${convertJavaTypeToJS(javaType)}`;
    })
    .join(", ");
  return `${methodName}(${convertedVariables})`;
}

const mapping = {
  float: "number",
  int: "number",
  double: "number",
  long: "number",
  short: "number",
  String: "string",
  byte: "number",
  "byte[]": "number[]",
  "String[]": "string[]",
  T: "any",
  Integer: "number",
  Byte: "number"
};

function convertJavaTypeToJS(javaType) {
  javaType = javaType
    .replace("static ", "")
    .replace("abstract ", "")
    .replace("protected", "")
    .trim();
  if (mapping[javaType]) return mapping[javaType];
  if (
    javaType.indexOf("List<") == 0 ||
    javaType.indexOf("Set<") == 0 ||
    javaType.indexOf("Collection<") == 0 ||
    javaType.indexOf("ArrayList<") == 0
  ) {
    const baseType = javaType.split("<")[1].replace(">", "");
    return mapping[baseType] ? `${mapping[baseType]}[]` : `${baseType}[]`;
  }
  if (javaType.indexOf("Map<") == 0) {
    let index = javaType.split("Map<")[1].split(",")[0];
    let value = javaType
      .split("Map<")[1]
      .split(",")[1]
      .split(">")
      .join("");
    index = mapping[index] ? mapping[index] : index;
    value = mapping[value] ? mapping[value] : value;
    return `Map<${index}, ${value}>`;
  }
  return javaType.replace("<T>\xa0void", "any");
}
