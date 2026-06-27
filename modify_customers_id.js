const fs = require('fs');
const file = '/mnt/two/projects/wholesale-mobile-app/admin-app/app/(tabs)/customers/[id].tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add FlashList import
if (!content.includes("@shopify/flash-list")) {
  content = content.replace(
    "import { SymbolView } from 'expo-symbols';",
    "import { SymbolView } from 'expo-symbols';\nimport { FlashList } from '@shopify/flash-list';"
  );
}

// 2. Modify SaleItemRow
content = content.replace(
  "function SaleItemRow({ item }: { item: SaleItem }) {",
  "function SaleItemRow({ item, colors }: { item: SaleItem; colors: any }) {"
);
content = content.replace(
  "  const colorScheme = useColorScheme();\n  const colors = Colors[colorScheme];\n",
  ""
);

// 3. Modify SaleItemsList
content = content.replace(
  "function SaleItemsList({ sale }: { sale: Sale }) {",
  "function SaleItemsList({ sale, colors }: { sale: Sale; colors: any }) {"
);
content = content.replace(
  "  const colorScheme = useColorScheme();\n  const colors = Colors[colorScheme];\n",
  ""
);
content = content.replace(
  "<SaleItemRow key={item.id} item={item} />",
  "<SaleItemRow key={item.id} item={item} colors={colors} />"
);
content = content.replace(
  "<SaleItemsList sale={sale} />",
  "<SaleItemsList sale={sale} colors={colors} />"
);

// 4. Update ScrollView to FlashList in the render
const scrollStart = content.indexOf('<ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>');
const scrollEnd = content.indexOf('</ScrollView>', scrollStart) + '</ScrollView>'.length;

let scrollContent = content.substring(scrollStart, scrollEnd);
// We will manually construct the FlashList replacement
let newList = scrollContent
  .replace('<ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>', 
           `<FlashList\n          data={activeTab === 'transactions' ? combinedTransactions : []}\n          estimatedItemSize={100}\n          contentContainerStyle={styles.scrollContent}\n          ListHeaderComponent={\n            <>\n`)
  .replace('{/* Combined List of Transactions */}', `</>\n          }\n          ListEmptyComponent={\n            activeTab === 'transactions' ? (`)
  .replace('{combinedTransactions.length === 0 ? (', '')
  .replace(`</View>\n                ) : (\n                  combinedTransactions.map((item) => {`, `</View>\n            ) : null\n          }\n          renderItem={({ item }) => {`)
  .replace(`                  })\n                )}\n              </View>\n            )}`, `          }\n        />\n              </View>\n            )}`)
  .replace('</ScrollView>', ''); // Remove trailing ScrollView tag

content = content.substring(0, scrollStart) + newList + content.substring(scrollEnd);

// Also need to move the bill tab panel inside the ListHeaderComponent so it scrolls correctly
// Actually, it's easier to just put it in ListHeaderComponent
let billTabContent = content.match(/\{\/\* Bill Generation Tab Panel \*\/\}[\s\S]*?(?=\{\/\* Sticky Bottom Actions Comfort Zone CTAs \*\/})/)[0];
content = content.replace(billTabContent, ""); // Remove it from the bottom

// Insert it into ListHeaderComponent right after FiltersWrapper
content = content.replace(`{/* Modals for Date Pickers */}`, `
                ${billTabContent}
                {/* Modals for Date Pickers */}`);

fs.writeFileSync(file, content);
