import os

import fitz


def pdf_to_markdown_chunks(pdf_path, source_name=None):
    doc = fitz.open(pdf_path)
    final_data = []
    source_value = source_name or os.path.basename(pdf_path)

    for page_index, page in enumerate(doc):
        # 1. Get the tables on the page
        tabs = page.find_tables()
        
        # 2. Extract standard text
        # Use "text" for simple flow, or "blocks" for better spatial control
        page_text = page.get_text("text")

        if tabs.tables:
            for i, table in enumerate(tabs):
                # Get table content as a list of lists
                table_data = table.extract()
                
                # 3. Convert List of Lists to Markdown String
                md_table = "\n"
                for row_idx, row in enumerate(table_data):
                    # Clean None values and join with pipes
                    clean_row = [str(cell).replace("\n", " ").strip() if cell else "" for cell in row]
                    md_table += "| " + " | ".join(clean_row) + " |\n"
                    
                    # Add the Markdown separator line after the header
                    if row_idx == 0:
                        md_table += "| " + " | ".join(["---"] * len(row)) + " |\n"
                
                # Append the table to our page data
                # In a real RAG pipeline, you'd insert this md_table 
                # into the page_text at the correct position.
                page_text += f"\n\n### Table {i+1}\n{md_table}\n"

        final_data.append({
            "content": page_text,
            "metadata": {"page": page_index + 1, "source": source_value}
        })
        
    return final_data
